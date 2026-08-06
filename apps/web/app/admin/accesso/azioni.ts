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

/** Uscita dal pannello. Un bottone in ogni pagina, in fascia. */
export async function esci(): Promise<void> {
  const sb = await createServerSupabase()

  const { error } = await sb.auth.signOut()
  if (error) logger.warn('admin.uscita_non_riuscita', { error })

  const biscotti = await cookies()
  biscotti.delete({ name: COOKIE_EMAIL, path: '/admin' })

  redirect('/admin/accesso?uscita=fatta')
}
