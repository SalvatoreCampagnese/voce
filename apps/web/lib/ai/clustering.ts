import { zodResponseFormat } from 'openai/helpers/zod'

import { createServiceClient } from '@/lib/supabase/service'
import { logger, logAiUsage } from '@/lib/utils/logger'
import { MODEL_TRIAGE, getOpenAI, stimaCostoEuro } from '@/lib/ai/openai'
import { valutaSogliaAzione } from '@/lib/ai/triage'
import {
  CLUSTER_SUMMARY_SYSTEM_PROMPT,
  ClusterSummarySchema,
} from '@/lib/ai/prompts'
import { getSoglie } from '@/lib/config/thresholds'
import { valutaBrigading } from '@/lib/security/brigading'

export interface ReclusterResult {
  esaminati: number
  gruppiCreati: number
  segnalazioniRaggruppate: number
  interrottoPerTempo: boolean
}

/**
 * Crea nuovi gruppi a partire dalle segnalazioni ancora sole.
 *
 * Il triage sa solo AGGIUNGERE una segnalazione a un gruppo che esiste già.
 * Il primo gruppo non nascerebbe mai senza questo passaggio: qui si cercano
 * insiemi di segnalazioni simili e non ancora raggruppate, e quando sono
 * abbastanza si dà loro un nome.
 *
 * Nota sulla soglia: bastano MIN_REPORTS_NEW_CLUSTER segnalazioni, anche di una
 * sola persona. Non è una svista — un gruppo così resta invisibile al pubblico
 * (le viste pubbliche pretendono 3 cittadini distinti) e non fa scattare nessun
 * atto (la soglia d'azione conta le persone). Chi scrive cinque volte ottiene
 * di essere ascoltato, non di sembrare un movimento.
 */
export async function ricostruisciGruppi(): Promise<ReclusterResult> {
  const soglie = getSoglie()
  const sb = createServiceClient()
  const inizio = Date.now()

  const risultato: ReclusterResult = {
    esaminati: 0,
    gruppiCreati: 0,
    segnalazioniRaggruppate: 0,
    interrottoPerTempo: false,
  }

  const seiGiorniFa = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: orfane, error } = await sb
    .from('reports')
    .select('id, city, neighborhood, category')
    .is('cluster_id', null)
    .eq('status', 'triaged')
    .gte('created_at', seiGiorniFa)
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) throw new Error(`Lettura segnalazioni orfane fallita: ${error.message}`)
  if (!orfane?.length) return risultato

  // Le segnalazioni già assorbite da un gruppo creato in questo giro non vanno
  // riesaminate: senza questo insieme, il ciclo rifarebbe lo stesso lavoro n volte.
  const assorbite = new Set<string>()

  for (const orfana of orfane) {
    if (assorbite.has(orfana.id)) continue

    // Il cron ha un tetto di durata: meglio fermarsi e riprendere al giro dopo
    // che farsi troncare a metà dalla piattaforma senza scrivere l'esito.
    if (Date.now() - inizio > soglie.cronTimeBudgetMs) {
      risultato.interrottoPerTempo = true
      break
    }

    risultato.esaminati += 1

    const { data: vettore } = await sb
      .from('report_embeddings')
      .select('embedding')
      .eq('report_id', orfana.id)
      .maybeSingle()

    if (!vettore?.embedding) continue

    const { data: simili, error: erroreMatch } = await sb.rpc('match_similar_reports', {
      query_embedding: vettore.embedding as unknown as string,
      match_threshold: soglie.similarityNew,
      match_count: 50,
      filter_city: orfana.city ?? undefined,
      filter_neighborhood: orfana.neighborhood ?? undefined,
      filter_category: orfana.category ?? undefined,
    })

    if (erroreMatch) {
      logger.warn('recluster.match_fallito', { report_id: orfana.id, errore: erroreMatch.message })
      continue
    }

    const candidate = (simili ?? []).filter((s) => !s.cluster_id && !assorbite.has(s.report_id))
    if (candidate.length < soglie.minReportsNewCluster) continue

    const ids = candidate.map((c) => c.report_id)

    // --- Titolo e riassunto ------------------------------------------------
    const { data: testi } = await sb
      .from('reports')
      .select('anon_text, created_at, location_hint')
      .in('id', ids)
      .limit(50)

    const contesto = (testi ?? [])
      .map((t, i) => `[${i + 1}] ${t.created_at.slice(0, 10)} — ${t.location_hint ?? 'luogo non indicato'}: ${t.anon_text}`)
      .join('\n')

    const openai = getOpenAI()
    const completamento = await openai.chat.completions.parse({
      model: MODEL_TRIAGE,
      messages: [
        { role: 'system', content: CLUSTER_SUMMARY_SYSTEM_PROMPT },
        { role: 'user', content: contesto },
      ],
      response_format: zodResponseFormat(ClusterSummarySchema, 'riassunto'),
      temperature: 0.2,
    })

    const riassunto = completamento.choices[0]?.message.parsed
    if (!riassunto) {
      logger.warn('recluster.riassunto_fallito', { report_id: orfana.id })
      continue
    }

    logAiUsage({
      model: MODEL_TRIAGE,
      operation: 'cluster_summary',
      input_tokens: completamento.usage?.prompt_tokens ?? 0,
      output_tokens: completamento.usage?.completion_tokens ?? 0,
      cost_eur: stimaCostoEuro(
        MODEL_TRIAGE,
        completamento.usage?.prompt_tokens ?? 0,
        completamento.usage?.completion_tokens ?? 0,
      ),
    })

    // --- Creazione del gruppo ---------------------------------------------
    const { data: gruppo, error: erroreGruppo } = await sb
      .from('clusters')
      .insert({
        title: riassunto.title,
        summary: riassunto.summary,
        category: orfana.category ?? 'altro',
        city: orfana.city ?? 'non indicata',
        neighborhood: orfana.neighborhood,
      })
      .select('id')
      .single()

    if (erroreGruppo || !gruppo) {
      logger.error('recluster.creazione_fallita', { errore: erroreGruppo?.message })
      continue
    }

    const { error: erroreAssegna } = await sb
      .from('reports')
      .update({ cluster_id: gruppo.id, status: 'clustered' })
      .in('id', ids)

    if (erroreAssegna) {
      logger.error('recluster.assegnazione_fallita', {
        cluster_id: gruppo.id,
        errore: erroreAssegna.message,
      })
      continue
    }

    ids.forEach((id) => assorbite.add(id))
    risultato.gruppiCreati += 1
    risultato.segnalazioniRaggruppate += ids.length

    // I segnali di coordinamento si valutano PRIMA della soglia d'azione, e
    // l'ordine non è estetico: valutaSogliaAzione() può far partire subito la
    // generazione degli atti, e il trigger che blocca gli atti sui gruppi in
    // revisione può bloccarli solo se il flag esiste già. Invertendo le due
    // righe, una campagna coordinata otterrebbe il suo esposto nel minuto in cui
    // il gruppo nasce, e la revisione arriverebbe a cose fatte.
    //
    // Un fallimento qui non ferma il clustering: far incontrare le persone che
    // hanno lo stesso problema è il lavoro principale, il sospetto è un di più.
    try {
      await valutaBrigading(gruppo.id)
    } catch (errore) {
      logger.error('recluster.brigading_fallito', { cluster_id: gruppo.id, error: errore })
    }

    // Un gruppo può nascere già sopra la soglia d'azione: senza questa
    // valutazione resterebbe 'emergente' per sempre, perché il controllo del
    // triage scatta solo quando è il triage ad assegnare la segnalazione.
    await valutaSogliaAzione(gruppo.id)

    logger.info('recluster.gruppo_creato', {
      cluster_id: gruppo.id,
      titolo: riassunto.title,
      segnalazioni: ids.length,
    })
  }

  return risultato
}
