'use server'

/**
 * Revisione di un gruppo segnalato per sospetto coordinamento (PLAN2 §5.2).
 *
 * Il limite invalicabile di questa pagina sta scritto anche qui, perché è dove
 * il codice potrebbe tradirlo: si valuta il GRUPPO, mai il cittadino. Non
 * esiste, e non deve esistere, una funzione che accetti un `citizen_id`. Un
 * punteggio per persona classificherebbe chi scrive male o è arrabbiato come
 * meno credibile — l'esatto opposto della ragione per cui VOCE esiste.
 *
 * L'esito della revisione è binario e riguarda una sola cosa: se il gruppo può
 * generare atti. Il flag non nasconde il gruppo al pubblico e queste funzioni
 * non toccano nulla che lo renda meno visibile.
 */

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { richiediAdmin } from '@/lib/auth/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import { logger } from '@/lib/utils/logger'

const SchemaId = z.object({ clusterId: z.uuid() })

function codiceErrore(errore: { code?: string } | null): string {
  if (!errore) return 'errore'
  if (errore.code === '42501') return 'permesso-negato'
  return 'errore'
}

function leggiId(formData: FormData): string | null {
  const analisi = SchemaId.safeParse({ clusterId: String(formData.get('clusterId') ?? '') })
  return analisi.success ? analisi.data.clusterId : null
}

/**
 * Chiude la revisione: il gruppo torna a poter generare atti.
 *
 * È il gesto che sblocca davvero qualcosa. Finché `review_flag` è vero il
 * trigger `actions_before_insert_review` rifiuta ogni nuovo atto su questo
 * gruppo, e nessuna scorciatoia applicativa lo aggira.
 *
 * `review_reason` non viene cancellato: la ragione per cui il sospetto era
 * nato resta scritta, altrimenti fra un mese nessuno saprebbe più perché il
 * gruppo era stato fermato né chi lo ha rimesso in moto.
 */
export async function togliFlagRevisione(formData: FormData): Promise<void> {
  const admin = await richiediAdmin()
  const clusterId = leggiId(formData)
  if (!clusterId) redirect('/admin/gruppi?errore=dati-non-validi')

  const sb = await createServerSupabase()

  const { error } = await sb
    .from('clusters')
    .update({
      review_flag: false,
      reviewed_by: admin.fullName,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', clusterId)

  if (error) {
    logger.error('admin.gruppo.sblocco_fallito', {
      cluster_id: clusterId,
      codice: error.code,
      messaggio: error.message,
    })
    redirect(`/admin/gruppi?errore=${codiceErrore(error)}`)
  }

  logger.info('admin.gruppo.revisione_chiusa', { cluster_id: clusterId })
  revalidatePath('/gruppi')
  revalidatePath('/gruppi/[id]', 'page')
  redirect(`/admin/gruppi?esito=flag-tolto#gruppo-${clusterId}`)
}

/**
 * Conferma il sospetto: il gruppo resta fermo sugli atti.
 *
 * Resta però pubblico, e questo è voluto: il flag alza una mano, non chiude una
 * bocca. Un atto costruito su una campagna coordinata danneggia chi lo ha
 * firmato in buona fede; una pagina di gruppo no.
 */
export async function confermaSospetto(formData: FormData): Promise<void> {
  const admin = await richiediAdmin()
  const clusterId = leggiId(formData)
  if (!clusterId) redirect('/admin/gruppi?errore=dati-non-validi')

  const sb = await createServerSupabase()

  const { error } = await sb
    .from('clusters')
    .update({
      review_flag: true,
      reviewed_by: admin.fullName,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', clusterId)

  if (error) {
    logger.error('admin.gruppo.conferma_fallita', {
      cluster_id: clusterId,
      codice: error.code,
      messaggio: error.message,
    })
    redirect(`/admin/gruppi?errore=${codiceErrore(error)}`)
  }

  logger.info('admin.gruppo.sospetto_confermato', { cluster_id: clusterId })
  redirect(`/admin/gruppi?esito=sospetto-confermato#gruppo-${clusterId}`)
}
