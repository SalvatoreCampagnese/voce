/**
 * Chi sta usando il pannello di amministrazione.
 *
 * QUESTO FILE NON È IL CONTROLLO DI SICUREZZA.
 * Il controllo vero sta nelle policy RLS del database: `is_admin()` decide riga
 * per riga cosa una sessione può leggere, e le viste `admin_*` restituiscono
 * zero righe a chiunque altro. Se un giorno una pagina dimenticasse di chiamare
 * `richiediAdmin()`, il danno sarebbe una pagina vuota, non una fuga di dati.
 * Qui dentro si decide solo *cosa mostrare a chi*, non *chi può leggere cosa*.
 *
 * Per la stessa ragione nessuna pagina del pannello usa `createServiceClient()`:
 * la service role bypassa la RLS, quindi un errore di scrittura in una query
 * diventerebbe l'esposizione del racconto grezzo di un cittadino invece di un
 * risultato vuoto. L'unica eccezione ammessa è il rimettere in coda le
 * notifiche fallite (/admin/notifiche), motivata sul posto.
 *
 * ------------------------------------------------------------------------
 * COME SI CREA IL PRIMO AMMINISTRATORE
 *
 * Un amministratore esiste in tabella PRIMA di aver mai fatto login: l'account
 * nasce dall'accesso con codice, e l'accesso deve già sapere chi far entrare.
 * La riga si inserisce con service role (mai da una pagina web) e va aperta la
 * finestra d'invito, che `link_current_admin()` consuma al primo uso.
 *
 * In locale:
 *
 *   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "
 *     insert into public.admins (email, full_name, link_allowed_until)
 *     values ('nome.cognome@comune.it', 'Nome Cognome', now() + interval '48 hours')
 *     on conflict (email) do update
 *       set full_name          = excluded.full_name,
 *           link_allowed_until = now() + interval '48 hours';"
 *
 * In produzione: stessa istruzione dall'editor SQL di Supabase.
 * Senza questa riga il pannello è inaccessibile a chiunque, e nessun messaggio
 * di errore lo spiega — è voluto: la pagina di accesso non dice mai se un
 * indirizzo è di un amministratore.
 *
 * Per riaprire un invito scaduto basta la stessa `on conflict do update`.
 * ------------------------------------------------------------------------
 */

import { redirect } from 'next/navigation'

import { createServerSupabase } from '@/lib/supabase/server'
import { logger } from '@/lib/utils/logger'

export interface AdminSessione {
  id: string
  email: string
  fullName: string
}

/**
 * Esito del collegamento fra la sessione appena creata e la riga di `admins`.
 * Serve solo alla pagina di accesso, che deve distinguere «non hai un accesso
 * valido» da «non hai proprio una sessione». Le pagine normali usano
 * `richiediAdmin()` e non hanno bisogno di questa distinzione.
 */
export type EsitoCollegamento = 'collegato' | 'senza-sessione' | 'non-abilitato'

/**
 * L'amministratore collegato, oppure null.
 *
 * Non lancia mai: la pagina di accesso la chiama proprio quando la risposta
 * attesa è «nessuno», e un'eccezione lì dentro sarebbe una schermata di errore
 * al posto del modulo di accesso.
 */
export async function getAdminCorrente(): Promise<AdminSessione | null> {
  try {
    const sb = await createServerSupabase()

    // getUser() e non getSession(): l'identità va confermata dal server di
    // autenticazione, non letta da un cookie che il browser può aver
    // manomesso. Costa una chiamata, e su una pagina di amministrazione è un
    // costo che si paga volentieri.
    const {
      data: { user },
    } = await sb.auth.getUser()

    if (!user) return null

    const riga = await leggiRiga(sb, user.id)
    if (riga) return riga

    // Nessuna riga collegata a questa sessione. Può essere il primo accesso di
    // un amministratore invitato: `link_current_admin()` prova a saldare i due
    // mondi, e restituisce false se l'invito non è aperto.
    const { data: collegato, error } = await sb.rpc('link_current_admin')

    if (error) {
      logger.warn('admin.collegamento_non_riuscito', { error })
      return null
    }

    if (!collegato) return null

    return await leggiRiga(sb, user.id)
  } catch (errore) {
    // Supabase irraggiungibile, cookie illeggibili: il pannello non si apre,
    // ma l'errore non resta muto.
    logger.error('admin.sessione_non_letta', { error: errore })
    return null
  }
}

/**
 * Come sopra, ma manda alla pagina di accesso se non sei amministratore.
 * È la prima riga di ogni pagina del pannello.
 */
export async function richiediAdmin(): Promise<AdminSessione> {
  const admin = await getAdminCorrente()
  // redirect() lancia per progetto: va chiamata fuori da qualunque try.
  if (!admin) redirect('/admin/accesso')
  return admin
}

/**
 * Tenta il collegamento subito dopo la verifica del codice.
 *
 * Distingue i due esiti che la pagina di accesso deve trattare in modo diverso
 * *nei log* — non nel messaggio mostrato, che resta uno solo: dire «questo
 * indirizzo non è un amministratore» permetterebbe di ricavare l'elenco degli
 * amministratori provando indirizzi.
 */
export async function collegaAdminCorrente(): Promise<EsitoCollegamento> {
  try {
    const sb = await createServerSupabase()

    const {
      data: { user },
    } = await sb.auth.getUser()

    if (!user) return 'senza-sessione'

    const giaCollegato = await leggiRiga(sb, user.id)
    if (giaCollegato) return 'collegato'

    const { data: collegato, error } = await sb.rpc('link_current_admin')

    if (error) {
      logger.warn('admin.collegamento_non_riuscito', { error })
      return 'non-abilitato'
    }

    if (!collegato) {
      // Tre casi indistinguibili da qui, ed è giusto così: l'indirizzo non è in
      // `admins`, oppure la finestra d'invito è chiusa, oppure è già stata
      // consumata da un'altra sessione.
      logger.warn('admin.invito_non_valido')
      return 'non-abilitato'
    }

    return (await leggiRiga(sb, user.id)) ? 'collegato' : 'non-abilitato'
  } catch (errore) {
    logger.error('admin.collegamento_fallito', { error: errore })
    return 'non-abilitato'
  }
}

/**
 * Legge la riga di `admins` della sessione corrente.
 *
 * Il filtro su `auth_user_id` è ridondante rispetto alla policy `admin_self_read`
 * — che già limita la lettura alla propria riga — e resta scritto lo stesso:
 * una query che dipende solo dalla RLS è una query che nessuno rilegge il
 * giorno in cui la policy cambia.
 */
async function leggiRiga(
  sb: Awaited<ReturnType<typeof createServerSupabase>>,
  authUserId: string,
): Promise<AdminSessione | null> {
  const { data, error } = await sb
    .from('admins')
    .select('id, email, full_name')
    .eq('auth_user_id', authUserId)
    .maybeSingle()

  if (error) {
    logger.warn('admin.riga_non_letta', { error })
    return null
  }

  if (!data) return null

  return { id: data.id, email: data.email, fullName: data.full_name }
}
