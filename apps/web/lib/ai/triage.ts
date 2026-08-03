import { zodResponseFormat } from 'openai/helpers/zod'

import { createServiceClient } from '@/lib/supabase/service'
import { logger, logAiUsage } from '@/lib/utils/logger'
import {
  EMBED_DIMENSIONS,
  MODEL_EMBED,
  MODEL_TRIAGE,
  getOpenAI,
  stimaCostoEuro,
} from '@/lib/ai/openai'
import { TRIAGE_SYSTEM_PROMPT, TriageSchema, type TriageOutput } from '@/lib/ai/prompts'
import { getSoglie } from '@/lib/config/thresholds'

/**
 * Normalizza un campo testuale opzionale prodotto dal modello.
 *
 * Serve perché uno schema `z.string().nullable()` accetta anche la STRINGA
 * "null": il modello, a cui abbiamo chiesto di scrivere null, ogni tanto scrive
 * le quattro lettere. Senza questo filtro il valore finisce nella colonna
 * `city`, `needsCity` diventa falso (una stringa piena è truthy), il bot non
 * chiede più niente e la segnalazione si raggruppa solo con le altre che hanno
 * lo stesso identico "null". Un guasto silenzioso e difficile da vedere.
 */
function normalizzaCampo(valore: string | null | undefined): string | null {
  if (valore == null) return null
  const testo = valore.trim()
  if (!testo) return null

  const VUOTI = new Set([
    'null', 'none', 'nil', 'undefined', 'n/a', 'na', 'n/d', 'nd', 'n.d.',
    'non specificato', 'non indicato', 'non disponibile', 'sconosciuto',
    'ignoto', '-', '—', '?',
  ])
  if (VUOTI.has(testo.toLowerCase())) return null

  return testo
}

export interface TriageResult {
  reportId: string
  category: string
  urgency: number
  clustered: boolean
  clusterId: string | null
  actionable: boolean
  /** Il comune resta ignoto: senza, il raggruppamento geografico non funziona. */
  needsCity: boolean
}

/**
 * Smista una segnalazione: la capisce, la vettorializza, la confronta con le
 * altre e — se assomiglia a un problema già noto nella stessa zona — la unisce
 * a quel gruppo.
 *
 * Il report è già salvato quando questa funzione parte. Se qualcosa qui fallisce,
 * il report resta con status 'nuovo' e il cron di recupero lo ripesca: la
 * segnalazione di un cittadino non si perde mai per un errore nostro.
 */
export async function triageReport(reportId: string): Promise<TriageResult> {
  const sb = createServiceClient()
  const openai = getOpenAI()

  const { data: report, error: erroreLettura } = await sb
    .from('reports')
    // La FK va nominata: da quando citizens.pending_city_report_id punta a
    // reports, fra le due tabelle ci sono DUE relazioni e PostgREST non sa
    // quale intendi (PGRST201). Senza il nome, l'intero triage fallisce.
    .select('*, citizens!reports_citizen_id_fkey(city, neighborhood)')
    .eq('id', reportId)
    .single()

  if (erroreLettura || !report) {
    throw new Error(`Segnalazione ${reportId} non trovata: ${erroreLettura?.message}`)
  }

  // Il comune del cittadino, se lo conosciamo già da una segnalazione
  // precedente. Si chiede una volta sola: chiederlo a ogni messaggio sarebbe
  // un modo sicuro di far smettere di scrivere le persone.
  const cittadino = (report as { citizens?: { city: string | null; neighborhood: string | null } | null })
    .citizens

  // --- 1. Estrazione strutturata -------------------------------------------
  const completamento = await openai.chat.completions.parse({
    model: MODEL_TRIAGE,
    messages: [
      { role: 'system', content: TRIAGE_SYSTEM_PROMPT },
      { role: 'user', content: report.raw_text },
    ],
    response_format: zodResponseFormat(TriageSchema, 'triage'),
    temperature: 0,
  })

  const meta = completamento.choices[0]?.message.parsed as TriageOutput | null
  if (!meta) {
    throw new Error(`Il modello non ha prodotto un'estrazione valida per ${reportId}`)
  }

  logAiUsage({
    model: MODEL_TRIAGE,
    operation: 'triage',
    input_tokens: completamento.usage?.prompt_tokens ?? 0,
    output_tokens: completamento.usage?.completion_tokens ?? 0,
    cost_eur: stimaCostoEuro(
      MODEL_TRIAGE,
      completamento.usage?.prompt_tokens ?? 0,
      completamento.usage?.completion_tokens ?? 0,
    ),
    report_id: reportId,
  })

  // Un saluto o una prova non entra nel flusso civico: si archivia e basta.
  if (!meta.is_actionable) {
    await sb
      .from('reports')
      .update({ status: 'archiviato', triaged_at: new Date().toISOString() })
      .eq('id', reportId)

    logger.info('triage.non_azionabile', { report_id: reportId })
    return {
      reportId,
      category: meta.category,
      urgency: meta.urgency,
      clustered: false,
      clusterId: null,
      actionable: false,
      needsCity: false,
    }
  }

  // --- 2. Embedding sul testo ripulito -------------------------------------
  // Sul clean_text e non sul grezzo: toglie il rumore di ortografia, dialetto e
  // sfogo, e rende i gruppi molto più stabili.
  const embedding = await openai.embeddings.create({
    model: MODEL_EMBED,
    input: meta.clean_text,
  })

  const vettore = embedding.data[0]?.embedding
  if (!vettore || vettore.length !== EMBED_DIMENSIONS) {
    throw new Error(`Embedding di dimensione inattesa per ${reportId}`)
  }

  logAiUsage({
    model: MODEL_EMBED,
    operation: 'embedding',
    input_tokens: embedding.usage?.prompt_tokens ?? 0,
    output_tokens: 0,
    cost_eur: stimaCostoEuro(MODEL_EMBED, embedding.usage?.prompt_tokens ?? 0),
    report_id: reportId,
  })

  // Priorità: quello che ha scritto ora > quello che sappiamo di lui > quello
  // che era già sulla segnalazione.
  const citta =
    normalizzaCampo(meta.city) ?? cittadino?.city ?? report.city ?? null
  const quartiere =
    normalizzaCampo(meta.neighborhood) ?? cittadino?.neighborhood ?? report.neighborhood ?? null
  const luogo = normalizzaCampo(meta.location_hint) ?? report.location_hint

  // --- 3. Cerca un gruppo esistente ----------------------------------------
  // I filtri di città/quartiere e categoria non sono un dettaglio: due
  // segnalazioni di "buche in strada" in quartieri diversi NON sono lo stesso
  // problema, per quanto i loro testi si somiglino.
  const { data: simili, error: erroreMatch } = await sb.rpc('match_similar_reports', {
    query_embedding: JSON.stringify(vettore),
    match_threshold: getSoglie().similarityAssign,
    match_count: 20,
    // I parametri della RPC accettano `undefined` per "nessun filtro": una
    // colonna vuota nel database è `null`, che qui va convertito.
    filter_city: citta ?? undefined,
    filter_neighborhood: quartiere ?? undefined,
    filter_category: meta.category,
  })

  if (erroreMatch) {
    logger.warn('triage.match_fallito', { report_id: reportId, errore: erroreMatch.message })
  }

  // Il gruppo più rappresentato fra le segnalazioni simili vince.
  const voti = new Map<string, number>()
  for (const riga of simili ?? []) {
    if (riga.cluster_id && riga.report_id !== reportId) {
      voti.set(riga.cluster_id, (voti.get(riga.cluster_id) ?? 0) + 1)
    }
  }
  const clusterId = [...voti.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  // --- 4. Salva --------------------------------------------------------------
  await sb.from('report_embeddings').upsert(
    {
      report_id: reportId,
      embedding: JSON.stringify(vettore),
      model: MODEL_EMBED,
    },
    { onConflict: 'report_id' },
  )

  const { error: erroreUpdate } = await sb
    .from('reports')
    .update({
      category: meta.category,
      urgency: meta.urgency,
      clean_text: meta.clean_text,
      anon_text: meta.anon_text,
      location_hint: luogo,
      city: citta,
      neighborhood: quartiere,
      status: clusterId ? 'clustered' : 'triaged',
      cluster_id: clusterId,
      triaged_at: new Date().toISOString(),
    })
    .eq('id', reportId)

  if (erroreUpdate) throw new Error(`Salvataggio triage fallito: ${erroreUpdate.message}`)

  // Se il testo ci ha rivelato il comune e del cittadino non lo sapevamo,
  // lo impariamo: le sue prossime segnalazioni non faranno domande.
  if (normalizzaCampo(meta.city) && !cittadino?.city && report.citizen_id) {
    await sb
      .from('citizens')
      .update({ city: citta, neighborhood: quartiere })
      .eq('id', report.citizen_id)
  }

  logger.info('triage.completato', {
    report_id: reportId,
    category: meta.category,
    urgency: meta.urgency,
    cluster_id: clusterId,
  })

  // --- 5. Soglia di azione ---------------------------------------------------
  if (clusterId) await valutaSogliaAzione(clusterId)

  return {
    reportId,
    category: meta.category,
    urgency: meta.urgency,
    clustered: Boolean(clusterId),
    clusterId,
    actionable: true,
    needsCity: !citta,
  }
}

/**
 * Quando un gruppo supera la soglia di cittadini DISTINTI, passa ad "attivo" e
 * si generano le bozze degli atti.
 *
 * Conta persone, non messaggi: chi scrive trenta volte non è un movimento.
 */
export async function valutaSogliaAzione(clusterId: string): Promise<void> {
  const sb = createServiceClient()

  const { data: gruppo } = await sb
    .from('clusters')
    .select('id, status, citizens_count')
    .eq('id', clusterId)
    .single()

  if (!gruppo || gruppo.status !== 'emergente') return
  if ((gruppo.citizens_count ?? 0) < getSoglie().actionThresholdCitizens) return

  await sb
    .from('clusters')
    .update({ status: 'attivo', threshold_reached_at: new Date().toISOString() })
    .eq('id', clusterId)

  logger.info('cluster.soglia_raggiunta', {
    cluster_id: clusterId,
    citizens_count: gruppo.citizens_count,
  })
}
