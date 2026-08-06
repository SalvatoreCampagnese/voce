'use server'

/**
 * Accesso al pannello con codice via email (OTP di Supabase Auth).
 *
 * NIENTE PASSWORD, per scelta: una password di amministratore va custodita,
 * scade, si riusa su altri siti e finisce in un foglio condiviso. Un codice a
 * sei cifre vive due minuti e non lascia niente da rubare.
 *
 * TUTTO PASSA DA SERVER ACTION, non da fetch: il modulo funziona anche senza
 * JavaScript, come /segnala. Il passaggio fra i due passi avviene con un
 * redirect e un cookie di servizio, quindi anche l'indietro del browser fa la
 * cosa giusta.
 *
 * L'EMAIL NON VIAGGIA NELL'INDIRIZZO. Fra il primo e il secondo passo sta in un
 * cookie httpOnly che dura un quarto d'ora: in una barra degli indirizzi
 * finirebbe nella cronologia, nei log del proxy e nel referer di ogni immagine.
 *
 * IN LOCALE le email non partono davvero: le legge Mailpit su
 * http://127.0.0.1:54324 — apri l'ultima ricevuta e copia il codice.
 * Perché nel messaggio ci sia un codice e non solo un collegamento, il modello
 * dell'email deve contenere `{{ .Token }}`: vedi la nota nel report finale
 * (`supabase/config.toml` non è un file di questo incarico).
 *
 * I MESSAGGI DI ERRORE NON DICONO MAI SE UN INDIRIZZO È DI UN AMMINISTRATORE.
 * Chi provasse mille indirizzi otterrebbe mille volte la stessa risposta: un
 * elenco di amministratori non deve essere ricavabile da questa pagina.
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { collegaAdminCorrente } from '@/lib/auth/admin'
import { serverEnv } from '@/lib/config/env'
import { createServerSupabase } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logger } from '@/lib/utils/logger'

/** Cookie di servizio che tiene l'email fra il passo 1 e il passo 2. */
const COOKIE_EMAIL = 'voce_accesso_email'

/** Un codice richiesto e mai usato non deve restare valido a fine giornata. */
const DURATA_COOKIE_SECONDI = 15 * 60

// Zod 4: `z.email()` al posto di `z.string().email()`, deprecato.
const SchemaEmail = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(200)),
})

const SchemaCodice = z.object({
  // Sei cifre: è la forma del codice di Supabase. Gli spazi incollati da un
  // client di posta si tolgono prima di controllare, non dopo aver dato errore.
  codice: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, ''))
    .pipe(z.string().regex(/^\d{6}$/)),
})

function opzioniCookie() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    // In produzione APP_URL è https: il cookie non deve viaggiare in chiaro.
    // In locale resta http, e forzare `secure` renderebbe il pannello
    // inutilizzabile proprio a chi lo sta provando.
    secure: serverEnv.APP_URL.startsWith('https://'),
    path: '/admin',
    maxAge: DURATA_COOKIE_SECONDI,
  }
}

/**
 * Passo 1: chiedi il codice.
 *
 * `shouldCreateUser: false`, e la ragione è duplice.
 *
 * SICUREZZA. Con la creazione automatica, chiunque conosca l'indirizzo di un
 * amministratore poteva farsi creare l'account di autenticazione su quella
 * email. Il collegamento con `admins` sarebbe stato comunque bloccato dalla
 * finestra d'invito, ma il conto sarebbe esistito, occupando l'indirizzo del
 * vero amministratore e potendo intercettarne il primo ingresso.
 *
 * FUNZIONAMENTO. Con le conferme dell'email attive — e devono restarlo, vedi
 * supabase/config.toml — una registrazione nuova fa partire il messaggio di
 * «conferma il tuo indirizzo», che NON contiene le sei cifre. Verificato su
 * Mailpit: il modulo le chiede, l'email non le manda, e non entrava nessuno.
 *
 * Un amministratore si provvede quindi in modo esplicito, con service role, in
 * un colpo solo: conto di autenticazione già confermato + riga in `admins` +
 * finestra d'invito. Le istruzioni stanno in docs/AMMINISTRATORI.md.
 */
export async function chiediCodice(formData: FormData): Promise<void> {
  const analisi = SchemaEmail.safeParse({ email: String(formData.get('email') ?? '') })

  if (!analisi.success) {
    redirect('/admin/accesso?errore=email-non-valida')
  }

  const email = analisi.data.email
  const sb = await createServerSupabase()

  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  })

  if (error) {
    // Succede anche a chi non è amministratore (limite di invii, SMTP giù):
    // il messaggio è lo stesso per tutti e non rivela niente.
    logger.warn('admin.codice_non_inviato', { error })
    redirect('/admin/accesso?errore=invio-non-riuscito')
  }

  const biscotti = await cookies()
  biscotti.set(COOKIE_EMAIL, email, opzioniCookie())

  logger.info('admin.codice_richiesto')

  redirect('/admin/accesso?passo=codice')
}

/**
 * Passo 2: verifica il codice e collega l'amministratore.
 *
 * L'ordine conta. Prima si verifica il codice (nasce la sessione), poi si prova
 * il collegamento con `admins`. Se il collegamento non riesce si esce subito:
 * una sessione autenticata senza riga di amministratore non deve restare
 * aperta, perché è esattamente la sessione che proverebbe a leggere le viste
 * `admin_*` e a farsi dire di no dalla RLS una richiesta alla volta.
 */
export async function verificaCodice(formData: FormData): Promise<void> {
  const biscotti = await cookies()
  const email = biscotti.get(COOKIE_EMAIL)?.value

  if (!email) {
    redirect('/admin/accesso?errore=sessione-scaduta')
  }

  const analisi = SchemaCodice.safeParse({ codice: String(formData.get('codice') ?? '') })

  if (!analisi.success) {
    redirect('/admin/accesso?passo=codice&errore=codice-non-valido')
  }

  const sb = await createServerSupabase()

  const { error } = await sb.auth.verifyOtp({
    email,
    token: analisi.data.codice,
    // 'email' copre sia il codice del primo accesso sia quello dei successivi:
    // Supabase manda il primo con il modello di conferma e gli altri con quello
    // del collegamento, e questo tipo li accetta entrambi.
    type: 'email',
  })

  if (error) {
    logger.warn('admin.codice_rifiutato', { error })
    redirect('/admin/accesso?passo=codice&errore=codice-non-valido')
  }

  const esito = await collegaAdminCorrente()

  if (esito !== 'collegato') {
    // Sessione valida ma nessun accesso al pannello. Si chiude subito e si
    // torna al primo passo con un messaggio che non distingue «non sei nella
    // tabella» da «il tuo invito è scaduto».
    await sb.auth.signOut()
    biscotti.delete({ name: COOKIE_EMAIL, path: '/admin' })
    logger.warn('admin.accesso_negato', { esito })
    redirect('/admin/accesso?errore=accesso-non-abilitato')
  }

  biscotti.delete({ name: COOKIE_EMAIL, path: '/admin' })
  logger.info('admin.accesso_riuscito')

  redirect('/admin')
}

/**
 * Nome mostrato accanto all'amministratore di prova, nel pannello.
 * Dice a chiare lettere che cosa è, a chiunque lo legga in una schermata.
 */
const NOME_DEMO = 'Amministratore di prova (dimostrazione)'

/** Quanto resta aperto l'invito appena creato per l'account di prova. */
const INVITO_DEMO_ORE = 24

/**
 * Ingresso dimostrativo nel pannello, senza codice via email.
 *
 * PERCHÉ ESISTE. VOCE oggi è una dimostrazione da hackathon: chi la guarda deve
 * poter aprire il pannello di moderazione in un clic. Il percorso normale gli
 * chiederebbe un codice a sei cifre inviato a una casella che non è la sua.
 *
 * PERCHÉ NON È UNA FALLA. Tre condizioni, tutte necessarie:
 *
 *   1. `DEMO_ADMIN_EMAIL` vuota disattiva tutto. Nessuna costante nel codice,
 *      nessun indirizzo predefinito: senza la variabile questa funzione esce
 *      subito e il bottone non compare nemmeno. Si spegne cancellando una riga
 *      dalla configurazione, e l'assenza si verifica guardandola.
 *   2. entra SOLO in quell'indirizzo. Non accetta parametri, non legge il
 *      modulo, non c'è niente da manomettere: chi la invoca diventa
 *      l'amministratore di prova o niente.
 *   3. l'account nasce con la stessa procedura degli altri — riga in `admins`
 *      più finestra d'invito consumata da `link_current_admin()` — quindi la
 *      RLS lo tratta come un amministratore qualunque, senza scorciatoie.
 *
 * COME CREA LA SESSIONE. `generateLink` con service role produce il codice OTP
 * **senza inviare nessuna email** (è la differenza con `signInWithOtp`), e quel
 * codice viene verificato subito qui sul server. Il risultato è una sessione
 * identica a quella di un accesso normale: stessi cookie, stessa scadenza,
 * stessa RLS. Non si scavalca l'autenticazione, si salta solo la casella di
 * posta.
 *
 * DA SPEGNERE PRIMA DEL PILOT SU CITTADINI VERI: da questo pannello si leggono
 * i racconti in chiaro delle persone.
 */
export async function entraComeDemo(): Promise<void> {
  const email = serverEnv.DEMO_ADMIN_EMAIL

  if (!email) {
    logger.warn('admin.demo_disattivata')
    redirect('/admin/accesso?errore=demo-non-attiva')
  }

  const servizio = createServiceClient()

  // --- 1. L'account di autenticazione --------------------------------------
  // Già confermato: `link_current_admin()` scarta chi ha l'email non
  // confermata, e per una casella che non esiste nessuno confermerà mai niente.
  // `createUser` fallisce se l'utente c'è già, ed è l'esito normale dal secondo
  // ingresso in poi: si prosegue.
  const { error: erroreUtente } = await servizio.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { demo: true },
  })

  if (erroreUtente && !/already|registered|exists/i.test(erroreUtente.message)) {
    logger.warn('admin.demo_utente_non_creato', { error: erroreUtente.message })
  }

  // --- 2. La riga in `admins` e la finestra d'invito ------------------------
  // Stessa istruzione documentata in lib/auth/admin.ts, eseguita qui invece che
  // a mano. `on conflict do update` riapre l'invito a ogni uso: una
  // dimostrazione mostrata fra una settimana non deve trovarlo scaduto.
  const { error: erroreAdmin } = await servizio.from('admins').upsert(
    {
      email,
      full_name: NOME_DEMO,
      link_allowed_until: new Date(Date.now() + INVITO_DEMO_ORE * 3600_000).toISOString(),
    },
    { onConflict: 'email' },
  )

  if (erroreAdmin) {
    logger.error('admin.demo_riga_non_creata', { error: erroreAdmin })
    redirect('/admin/accesso?errore=demo-non-riuscita')
  }

  // --- 3. Il codice, senza passare dalla posta -----------------------------
  const { data: collegamento, error: erroreCodice } = await servizio.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })

  const codice = collegamento?.properties?.email_otp

  if (erroreCodice || !codice) {
    logger.error('admin.demo_codice_non_generato', { error: erroreCodice })
    redirect('/admin/accesso?errore=demo-non-riuscita')
  }

  // --- 4. La sessione ------------------------------------------------------
  // Sul client SSR e non su quello di servizio: è questo che scrive i cookie
  // di sessione nella risposta.
  const sb = await createServerSupabase()

  // 'email' e non 'magiclink': il tipo `magiclink` è deprecato in supabase-js e
  // 'email' copre sia il primo accesso sia i successivi.
  const { error: erroreVerifica } = await sb.auth.verifyOtp({ email, token: codice, type: 'email' })

  if (erroreVerifica) {
    logger.error('admin.demo_verifica_fallita', { error: erroreVerifica })
    redirect('/admin/accesso?errore=demo-non-riuscita')
  }

  const esito = await collegaAdminCorrente()

  if (esito !== 'collegato') {
    await sb.auth.signOut()
    logger.error('admin.demo_collegamento_fallito', { esito })
    redirect('/admin/accesso?errore=demo-non-riuscita')
  }

  logger.info('admin.demo_accesso_riuscito')

  redirect('/admin')
}

/** Uscita dal pannello. Un bottone in ogni pagina, in fascia. */
export async function esci(): Promise<void> {
  const sb = await createServerSupabase()

  const { error } = await sb.auth.signOut()
  if (error) logger.warn('admin.uscita_non_riuscita', { error })

  const biscotti = await cookies()
  biscotti.delete({ name: COOKIE_EMAIL, path: '/admin' })

  redirect('/admin/accesso?uscita=fatta')
}
