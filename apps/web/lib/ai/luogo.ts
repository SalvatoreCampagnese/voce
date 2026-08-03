import { zodResponseFormat } from 'openai/helpers/zod'

import { createServiceClient } from '@/lib/supabase/service'
import { logger, logAiUsage } from '@/lib/utils/logger'
import { MODEL_TRIAGE, getOpenAI, stimaCostoEuro } from '@/lib/ai/openai'
import { LUOGO_SYSTEM_PROMPT, LuogoSchema, type LuogoOutput } from '@/lib/ai/prompts'
import { valutaSogliaAzione } from '@/lib/ai/triage'
import { getSoglie } from '@/lib/config/thresholds'

/**
 * Legge la risposta alla domanda «in che comune?».
 *
 * Ritorna `is_place: false` quando il messaggio non è una risposta ma un'altra
 * cosa: molto spesso una nuova segnalazione. Il chiamante deve trattarla come
 * tale invece di buttarla via — chi ha appena raccontato un problema non deve
 * perderlo perché noi stavamo aspettando altro.
 */
export async function estraiLuogo(testo: string): Promise<LuogoOutput | null> {
  const openai = getOpenAI()

  const completamento = await openai.chat.completions.parse({
    model: MODEL_TRIAGE,
    messages: [
      { role: 'system', content: LUOGO_SYSTEM_PROMPT },
      { role: 'user', content: testo },
    ],
    response_format: zodResponseFormat(LuogoSchema, 'luogo'),
    temperature: 0,
  })

  logAiUsage({
    model: MODEL_TRIAGE,
    operation: 'estrazione_luogo',
    input_tokens: completamento.usage?.prompt_tokens ?? 0,
    output_tokens: completamento.usage?.completion_tokens ?? 0,
    cost_eur: stimaCostoEuro(
      MODEL_TRIAGE,
      completamento.usage?.prompt_tokens ?? 0,
      completamento.usage?.completion_tokens ?? 0,
    ),
  })

  const parsed = completamento.choices[0]?.message.parsed
  if (!parsed) return null

  // Anche qui il modello può scrivere la stringa "null": vale come assente.
  const pulisci = (v: string | null) => {
    const t = (v ?? '').trim()
    return !t || ['null', 'none', 'n/d', 'nd', '-'].includes(t.toLowerCase()) ? null : t
  }

  return { ...parsed, city: pulisci(parsed.city), neighborhood: pulisci(parsed.neighborhood) }
}

/**
 * Applica il comune appreso a una segnalazione e riprova a raggrupparla.
 *
 * Non rifà l'estrazione né l'embedding: quelli ci sono già. Rifà solo il
 * confronto, che prima girava senza filtro geografico e ora può usarlo.
 */
export async function aggiornaLuogoSegnalazione(
  reportId: string,
  citta: string,
  quartiere: string | null,
): Promise<{ clusterId: string | null }> {
  const sb = createServiceClient()
  const soglie = getSoglie()

  const { data: report } = await sb
    .from('reports')
    .select('id, citizen_id, category, cluster_id, status')
    .eq('id', reportId)
    .maybeSingle()

  if (!report) return { clusterId: null }

  await sb
    .from('reports')
    .update({ city: citta, neighborhood: quartiere })
    .eq('id', reportId)

  // Il cittadino non dovrà più rispondere a questa domanda.
  if (report.citizen_id) {
    await sb
      .from('citizens')
      .update({ city: citta, neighborhood: quartiere, pending_city_report_id: null })
      .eq('id', report.citizen_id)
  }

  // Le altre segnalazioni dello stesso cittadino rimaste senza comune ereditano
  // il dato: se ne ha scritte tre di fila, non gliele chiediamo una per una.
  if (report.citizen_id) {
    await sb
      .from('reports')
      .update({ city: citta, neighborhood: quartiere })
      .eq('citizen_id', report.citizen_id)
      .is('city', null)
  }

  // Se era già in un gruppo non si tocca niente: spostarla romperebbe i
  // contatori di un gruppo che qualcuno sta già guardando.
  if (report.cluster_id) return { clusterId: report.cluster_id }

  const { data: vettore } = await sb
    .from('report_embeddings')
    .select('embedding')
    .eq('report_id', reportId)
    .maybeSingle()

  if (!vettore?.embedding) return { clusterId: null }

  const { data: simili, error } = await sb.rpc('match_similar_reports', {
    query_embedding: vettore.embedding as unknown as string,
    match_threshold: soglie.similarityAssign,
    match_count: 20,
    filter_city: citta,
    filter_neighborhood: quartiere ?? undefined,
    filter_category: report.category ?? undefined,
  })

  if (error) {
    logger.warn('luogo.match_fallito', { report_id: reportId, errore: error.message })
    return { clusterId: null }
  }

  const voti = new Map<string, number>()
  for (const riga of simili ?? []) {
    if (riga.cluster_id && riga.report_id !== reportId) {
      voti.set(riga.cluster_id, (voti.get(riga.cluster_id) ?? 0) + 1)
    }
  }
  const clusterId = [...voti.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  if (clusterId) {
    await sb
      .from('reports')
      .update({ cluster_id: clusterId, status: 'clustered' })
      .eq('id', reportId)
    await valutaSogliaAzione(clusterId)
    logger.info('luogo.gruppo_assegnato', { report_id: reportId, cluster_id: clusterId })
  }

  return { clusterId }
}
