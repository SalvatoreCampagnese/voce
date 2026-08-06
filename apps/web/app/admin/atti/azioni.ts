'use server'

/**
 * Le transizioni di un atto civico, tutte a mano.
 *
 * Non esiste una sola funzione qui dentro che venga chiamata da un job, da un
 * cron o da un altro pezzo di codice: ognuna nasce da un modulo premuto da una
 * persona. È la regola più importante del progetto — nessun atto parte senza
 * revisione umana — e il modo per non tradirla è non offrire mai un'alternativa
 * automatica.
 *
 * Tutte scrivono con il client di sessione (`createServerSupabase`), mai con il
 * service role: così la modifica passa dalla RLS e dai grant di colonna, che
 * limitano l'amministratore ai soli campi di revisione. Se un giorno qualcuno
 * aggiungesse un campo di troppo a un modulo, il database direbbe di no. Con il
 * service role direbbe di sì.
 */

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { richiediAdmin } from '@/lib/auth/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import { calcolaScadenza } from '@/lib/scadenze/termini'
import { logger } from '@/lib/utils/logger'

const SchemaId = z.object({ id: z.uuid() })

const SchemaCorrezione = z.object({
  id: z.uuid(),
  bodyMarkdown: z
    .string()
    .trim()
    .min(50, 'Il testo di un atto non può essere una riga.')
    .max(60000),
})

/**
 * Traduce l'errore del database in un codice leggibile in pagina.
 *
 * `42501` è il rifiuto dei grant di colonna: il pannello ha provato a scrivere
 * un campo che non gli appartiene. `23514` è il vincolo
 * `actions_review_before_send`, cioè un atto che tenta di partire senza il nome
 * di chi lo ha letto. Sono i due errori che questo pannello può davvero
 * incontrare, e vanno spiegati, non nascosti dietro un «riprova».
 */
function codiceErrore(errore: { code?: string } | null): string {
  if (!errore) return 'errore'
  if (errore.code === '42501') return 'permesso-negato'
  if (errore.code === '23514') return 'revisione-mancante'
  return 'errore'
}

/** Le pagine pubbliche che cambiano quando cambia un atto. */
function aggiornaPaginePubbliche(): void {
  revalidatePath('/dossier')
  revalidatePath('/dossier/[id]', 'page')
  revalidatePath('/gruppi/[id]', 'page')
  revalidatePath('/trasparenza')
}

function leggiId(formData: FormData): string | null {
  const analisi = SchemaId.safeParse({ id: String(formData.get('id') ?? '') })
  return analisi.success ? analisi.data.id : null
}

// ---------------------------------------------------------------------------
// 1. Revisiona e pubblica il testo
// ---------------------------------------------------------------------------

/**
 * La firma della persona che si assume la responsabilità del testo.
 *
 * `reviewed_by` non traccia soltanto: è la colonna che rende pubblico
 * `body_markdown` (migrazione 0008). Quella migrazione esiste perché un esposto
 * contenente la condizione clinica di un minore era finito online prima di
 * qualunque controllo. Da qui in poi il testo è indicizzabile, e il nome di chi
 * ha premuto è visibile accanto.
 *
 * Il nome è quello dell'amministratore collegato, non un identificativo
 * tecnico: il vincolo `actions_reviewed_pair` rifiuta una firma fatta di spazi,
 * e una firma fatta di un uuid non sarebbe una firma comunque.
 */
export async function revisionaEPubblica(formData: FormData): Promise<void> {
  const admin = await richiediAdmin()
  const id = leggiId(formData)
  if (!id) redirect('/admin/atti?errore=dati-non-validi')

  const sb = await createServerSupabase()

  const { data: atto } = await sb
    .from('actions')
    .select('id, reviewed_by')
    .eq('id', id)
    .maybeSingle()

  if (!atto) redirect(`/admin/atti?errore=non-trovato`)

  if (atto.reviewed_by) {
    // Non si sovrascrive la firma di un'altra persona: chi ha letto quel testo
    // resta chi lo ha letto.
    redirect(`/admin/atti/${id}?esito=gia-revisionato`)
  }

  const { error } = await sb
    .from('actions')
    .update({
      reviewed_by: admin.fullName,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) {
    logger.error('admin.atto.revisione_fallita', {
      action_id: id,
      codice: error.code,
      messaggio: error.message,
    })
    redirect(`/admin/atti/${id}?errore=${codiceErrore(error)}`)
  }

  logger.info('admin.atto.revisionato', { action_id: id })
  aggiornaPaginePubbliche()
  redirect(`/admin/atti/${id}?esito=pubblicato`)
}

// ---------------------------------------------------------------------------
// 2. Correggi il testo
// ---------------------------------------------------------------------------

/**
 * Si correggono gli errori della macchina, non le parole dei cittadini.
 *
 * Il corpo dell'atto è un testo generato: può citare una norma sbagliata,
 * gonfiare un fatto o inventare un dettaglio. Qui si aggiusta. Quello che non
 * si tocca è il racconto di chi ha segnalato: quello sta in `anon_text` e non
 * passa da questo modulo.
 */
export async function correggiTesto(formData: FormData): Promise<void> {
  await richiediAdmin()

  const analisi = SchemaCorrezione.safeParse({
    id: String(formData.get('id') ?? ''),
    bodyMarkdown: String(formData.get('bodyMarkdown') ?? ''),
  })

  if (!analisi.success) {
    const id = String(formData.get('id') ?? '')
    redirect(`/admin/atti/${id}?errore=dati-non-validi`)
  }

  const { id, bodyMarkdown } = analisi.data
  const sb = await createServerSupabase()

  const { error } = await sb
    .from('actions')
    .update({ body_markdown: bodyMarkdown })
    .eq('id', id)

  if (error) {
    logger.error('admin.atto.correzione_fallita', {
      action_id: id,
      codice: error.code,
      messaggio: error.message,
    })
    redirect(`/admin/atti/${id}?errore=${codiceErrore(error)}`)
  }

  logger.info('admin.atto.testo_corretto', { action_id: id })
  aggiornaPaginePubbliche()
  redirect(`/admin/atti/${id}?esito=testo-corretto`)
}

// ---------------------------------------------------------------------------
// 3. Apri la raccolta firme
// ---------------------------------------------------------------------------

export async function apriRaccoltaFirme(formData: FormData): Promise<void> {
  await richiediAdmin()
  const id = leggiId(formData)
  if (!id) redirect('/admin/atti?errore=dati-non-validi')

  const sb = await createServerSupabase()

  const { data: atto } = await sb
    .from('actions')
    .select('id, status')
    .eq('id', id)
    .maybeSingle()

  if (!atto) redirect('/admin/atti?errore=non-trovato')
  if (atto.status !== 'bozza') redirect(`/admin/atti/${id}?errore=stato-non-valido`)

  const { error } = await sb.from('actions').update({ status: 'in_firma' }).eq('id', id)

  if (error) {
    logger.error('admin.atto.apertura_firme_fallita', {
      action_id: id,
      codice: error.code,
      messaggio: error.message,
    })
    redirect(`/admin/atti/${id}?errore=${codiceErrore(error)}`)
  }

  logger.info('admin.atto.firme_aperte', { action_id: id })
  aggiornaPaginePubbliche()
  redirect(`/admin/atti/${id}?esito=firme-aperte`)
}

// ---------------------------------------------------------------------------
// 4. Segna come inviato — e fa partire il termine di legge
// ---------------------------------------------------------------------------

/**
 * Il momento in cui l'atto esce e comincia a contare il tempo.
 *
 * `submitted_at` senza `deadline_at` è mezza informazione: un accesso civico
 * ignorato senza qualcuno che conti i trenta giorni resta ignorato per sempre.
 * Per questo la data di scadenza si calcola qui, con la norma scritta accanto
 * (`deadline_basis`): un termine senza fonte è un'affermazione, e
 * un'affermazione sbagliata dentro un sollecito fa cestinare il fascicolo.
 *
 * Il controllo su `reviewed_by` è ridondante rispetto al vincolo
 * `actions_review_before_send`, e va bene così: il vincolo è l'ultima parola,
 * questo serve solo a dare all'amministratore una frase invece di un errore
 * `23514`.
 */
export async function segnaComeInviato(formData: FormData): Promise<void> {
  await richiediAdmin()
  const id = leggiId(formData)
  if (!id) redirect('/admin/atti?errore=dati-non-validi')

  const sb = await createServerSupabase()

  const { data: atto } = await sb
    .from('actions')
    .select('id, status, kind, reviewed_by')
    .eq('id', id)
    .maybeSingle()

  if (!atto) redirect('/admin/atti?errore=non-trovato')
  if (!atto.reviewed_by) redirect(`/admin/atti/${id}?errore=revisione-mancante`)
  if (atto.status !== 'in_firma') redirect(`/admin/atti/${id}?errore=stato-non-valido`)

  const inviatoIl = new Date()
  // Il conteggio dei giorni sta in `lib/scadenze/termini.ts` e non qui: il
  // termine scade con lo spirare dell'ultimo giorno (art. 2963 c.c.), non
  // nello stesso minuto in cui l'atto è partito. Rifarlo a mano significherebbe
  // sbagliarlo di un giorno, e un sollecito mandato un giorno prima si smonta
  // con una riga.
  const scadenza = calcolaScadenza(atto.kind, inviatoIl)

  const { error } = await sb
    .from('actions')
    .update({
      status: 'inviata',
      submitted_at: inviatoIl.toISOString(),
      deadline_at: scadenza?.deadlineAt ?? null,
      deadline_days: scadenza?.deadlineDays ?? null,
      deadline_basis: scadenza?.deadlineBasis ?? null,
    })
    .eq('id', id)

  if (error) {
    logger.error('admin.atto.invio_fallito', {
      action_id: id,
      codice: error.code,
      messaggio: error.message,
    })
    redirect(`/admin/atti/${id}?errore=${codiceErrore(error)}`)
  }

  logger.info('admin.atto.inviato', {
    action_id: id,
    deadline_days: scadenza?.deadlineDays ?? null,
  })
  aggiornaPaginePubbliche()
  redirect(`/admin/atti/${id}?esito=${scadenza ? 'inviato' : 'inviato-senza-termine'}`)
}

// ---------------------------------------------------------------------------
// 5. Archivia
// ---------------------------------------------------------------------------

export async function archiviaAtto(formData: FormData): Promise<void> {
  await richiediAdmin()
  const id = leggiId(formData)
  if (!id) redirect('/admin/atti?errore=dati-non-validi')

  const sb = await createServerSupabase()

  const { error } = await sb.from('actions').update({ status: 'archiviata' }).eq('id', id)

  if (error) {
    logger.error('admin.atto.archiviazione_fallita', {
      action_id: id,
      codice: error.code,
      messaggio: error.message,
    })
    redirect(`/admin/atti/${id}?errore=${codiceErrore(error)}`)
  }

  logger.info('admin.atto.archiviato', { action_id: id })
  aggiornaPaginePubbliche()
  redirect(`/admin/atti/${id}?esito=archiviato`)
}
