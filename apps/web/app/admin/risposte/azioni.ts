'use server'

/**
 * Le risposte della pubblica amministrazione: registrarle, correggerle,
 * confermarle.
 *
 * Il rischio che decide la forma di tutto questo file: una classificazione
 * sbagliata fa dichiarare pubblicamente che un comune ha ignorato una richiesta
 * a cui invece ha risposto. È un'accusa falsa a un'istituzione, pubblicata a
 * nome di cittadini che non l'hanno controllata.
 *
 * Da qui: il modello propone, una persona conferma, e solo la conferma rende
 * pubblico. `confirmed_by` non è un campo di comodo, è la condizione di
 * pubblicabilità — imposta dal database, non da questo codice.
 */

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { richiediAdmin } from '@/lib/auth/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import { serverEnv } from '@/lib/config/env'
import { internalRequestHeaders } from '@/lib/security/internal'
import { logger } from '@/lib/utils/logger'

const CLASSI = ['accolta', 'respinta', 'interlocutoria', 'irricevibile'] as const

const SchemaNuovaRisposta = z.object({
  actionId: z.uuid(),
  testo: z
    .string()
    .trim()
    .min(30, 'Incolla la risposta per intero.')
    .max(60000),
  fonte: z.enum(['manuale', 'pec', 'email']).default('manuale'),
})

const SchemaClassificazione = z.object({
  responseId: z.uuid(),
  classificazione: z.enum(CLASSI),
  citaArt5bis: z.boolean(),
})

const SchemaConferma = z.object({ responseId: z.uuid() })

function codiceErrore(errore: { code?: string } | null): string {
  if (!errore) return 'errore'
  if (errore.code === '42501') return 'permesso-negato'
  if (errore.code === '23514') return 'classificazione-mancante'
  return 'errore'
}

// ---------------------------------------------------------------------------
// 1. Registrare una risposta arrivata
// ---------------------------------------------------------------------------

/**
 * Salva il testo della risposta e chiede al modello di leggerla.
 *
 * L'ordine conta: prima si scrive la riga, poi si chiama la lettura. Se la
 * chiamata al modello fallisce — rete, quota, timeout — la risposta è comunque
 * salvata e si classifica a mano. Perdere il testo di una risposta perché un
 * servizio esterno era giù sarebbe un danno vero: quel documento a volte esiste
 * in una sola copia.
 *
 * `raw_text` resta privato per sempre: contiene protocolli, nomi di funzionari
 * e talvolta dati del richiedente.
 */
export async function registraRisposta(formData: FormData): Promise<void> {
  await richiediAdmin()

  const analisi = SchemaNuovaRisposta.safeParse({
    actionId: String(formData.get('actionId') ?? ''),
    testo: String(formData.get('testo') ?? ''),
    fonte: String(formData.get('fonte') ?? 'manuale'),
  })

  if (!analisi.success) {
    const troppoCorto = analisi.error.issues.some((problema) => problema.path[0] === 'testo')
    redirect(
      `/admin/risposte?errore=${troppoCorto ? 'testo-troppo-corto' : 'dati-non-validi'}`,
    )
  }

  const { actionId, testo, fonte } = analisi.data
  const sb = await createServerSupabase()

  const { data: risposta, error } = await sb
    .from('action_responses')
    .insert({
      action_id: actionId,
      raw_text: testo,
      source: fonte,
    })
    .select('id')
    .single()

  if (error || !risposta) {
    logger.error('admin.risposta.registrazione_fallita', {
      action_id: actionId,
      codice: error?.code,
      messaggio: error?.message,
    })
    redirect(`/admin/risposte?errore=${codiceErrore(error)}`)
  }

  logger.info('admin.risposta.registrata', {
    action_id: actionId,
    response_id: risposta.id,
  })

  // La lettura automatica è un aiuto, non una condizione. Se non parte, la
  // riga resta con `classification` a null e il pannello lo dice.
  let letta = false
  try {
    const esito = await fetch(`${serverEnv.APP_URL}/api/internal/classifica-risposta`, {
      method: 'POST',
      headers: internalRequestHeaders(),
      body: JSON.stringify({ responseId: risposta.id }),
    })
    letta = esito.ok
    if (!esito.ok) {
      logger.warn('admin.risposta.lettura_rifiutata', {
        response_id: risposta.id,
        status: esito.status,
      })
    }
  } catch (errore) {
    logger.warn('admin.risposta.lettura_non_avviata', {
      response_id: risposta.id,
      messaggio: errore instanceof Error ? errore.message : String(errore),
    })
  }

  redirect(
    `/admin/risposte?esito=${letta ? 'risposta-salvata' : 'risposta-salvata-senza-lettura'}#risposta-${risposta.id}`,
  )
}

// ---------------------------------------------------------------------------
// 2. Correggere la classificazione proposta dal modello
// ---------------------------------------------------------------------------

export async function correggiClassificazione(formData: FormData): Promise<void> {
  await richiediAdmin()

  const analisi = SchemaClassificazione.safeParse({
    responseId: String(formData.get('responseId') ?? ''),
    classificazione: String(formData.get('classificazione') ?? ''),
    citaArt5bis: formData.get('citaArt5bis') === 'si',
  })

  if (!analisi.success) redirect('/admin/risposte?errore=dati-non-validi')

  const { responseId, classificazione, citaArt5bis } = analisi.data
  const sb = await createServerSupabase()

  const { error } = await sb
    .from('action_responses')
    .update({
      classification: classificazione,
      cites_art_5bis: citaArt5bis,
    })
    .eq('id', responseId)

  if (error) {
    logger.error('admin.risposta.correzione_fallita', {
      response_id: responseId,
      codice: error.code,
      messaggio: error.message,
    })
    redirect(`/admin/risposte?errore=${codiceErrore(error)}`)
  }

  logger.info('admin.risposta.classificazione_corretta', {
    response_id: responseId,
    classificazione,
  })
  redirect(`/admin/risposte?esito=classificazione-corretta#risposta-${responseId}`)
}

// ---------------------------------------------------------------------------
// 3. Confermare — il momento in cui il dato diventa pubblico
// ---------------------------------------------------------------------------

/**
 * Solo dopo questa firma la risposta entra in `/trasparenza`.
 *
 * Il controllo su `classification` è ridondante rispetto al vincolo
 * `action_responses_confirm_requires_class`, e serve a dare una frase invece di
 * un errore del database. Confermare una risposta senza classificarla la
 * renderebbe pubblica come «classificazione assente», che in pagina si legge
 * come «non risulta risposta».
 *
 * Attenzione a cosa sta confermando l'amministratore: l'ESITO, non la
 * pubblicabilità del testo. Il motivo che finisce online è `reason_anon`, che
 * arriva dall'anonimizzazione ed è null finché quella non è passata.
 */
export async function confermaRisposta(formData: FormData): Promise<void> {
  const admin = await richiediAdmin()

  const analisi = SchemaConferma.safeParse({
    responseId: String(formData.get('responseId') ?? ''),
  })
  if (!analisi.success) redirect('/admin/risposte?errore=dati-non-validi')

  const { responseId } = analisi.data
  const sb = await createServerSupabase()

  const { data: risposta } = await sb
    .from('action_responses')
    .select('id, classification, confirmed_by')
    .eq('id', responseId)
    .maybeSingle()

  if (!risposta) redirect('/admin/risposte?errore=non-trovato')
  if (!risposta.classification) {
    redirect(`/admin/risposte?errore=classificazione-mancante#risposta-${responseId}`)
  }

  const { error } = await sb
    .from('action_responses')
    .update({
      confirmed_by: admin.fullName,
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', responseId)

  if (error) {
    logger.error('admin.risposta.conferma_fallita', {
      response_id: responseId,
      codice: error.code,
      messaggio: error.message,
    })
    redirect(`/admin/risposte?errore=${codiceErrore(error)}`)
  }

  logger.info('admin.risposta.confermata', {
    response_id: responseId,
    classificazione: risposta.classification,
  })

  // Il trigger `action_responses_after_confirm` ha appena portato l'atto a
  // 'risposta_ricevuta': anche le pagine dell'atto vanno rilette.
  revalidatePath('/trasparenza')
  revalidatePath('/dossier')
  revalidatePath('/dossier/[id]', 'page')

  redirect(`/admin/risposte?esito=risposta-confermata#risposta-${responseId}`)
}
