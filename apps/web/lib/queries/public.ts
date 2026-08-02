/**
 * Letture delle pagine pubbliche.
 *
 * Passano SOLO dalle viste `public_*`, che espongono anon_text, coordinate
 * arrotondate a 300 m e date troncate. Le tabelle grezze non si leggono mai da
 * una pagina pubblica, nemmeno per sbaglio: la RLS lo impedirebbe comunque, ma
 * la regola vale come disciplina, non come rete di sicurezza.
 *
 * Ogni funzione degrada con grazia: se Supabase non è configurato o è
 * irraggiungibile, la pagina mostra zero risultati invece di un errore 500.
 * Una landing che si rompe perché manca una variabile d'ambiente è un modo
 * stupido di perdere un cittadino.
 */

import { createAnonSupabase } from '@/lib/supabase/anon'
import { logger, serializeError } from '@/lib/utils/logger'
import type {
  PublicAction,
  PublicCityStats,
  PublicCluster,
  PublicClusterReport,
} from '@voce/db'

async function conClient<T>(
  operazione: string,
  fn: (sb: ReturnType<typeof createAnonSupabase>) => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    const sb = createAnonSupabase()
    return await fn(sb)
  } catch (errore) {
    // Gli errori di Supabase sono PostgrestError, non Error: `String(errore)`
    // darebbe "[object Object]" e nasconderebbe la causa.
    logger.error('query.public.failed', { operazione, ...serializeError(errore) })
    return fallback
  }
}

export interface StatistichePiattaforma {
  cittadini: number
  gruppi: number
  atti: number
  risposte: number
}

export async function getStatistichePiattaforma(): Promise<StatistichePiattaforma> {
  return conClient(
    'statistiche',
    async (sb) => {
      const { data, error } = await sb.from('public_city_stats').select('*')
      if (error) throw error
      const righe = (data ?? []) as PublicCityStats[]
      return {
        cittadini: righe.reduce((n, r) => n + Number(r.citizens_count ?? 0), 0),
        gruppi: righe.reduce((n, r) => n + Number(r.clusters_count ?? 0), 0),
        atti: righe.reduce((n, r) => n + Number(r.actions_sent ?? 0), 0),
        risposte: righe.reduce((n, r) => n + Number(r.responses_received ?? 0), 0),
      }
    },
    { cittadini: 0, gruppi: 0, atti: 0, risposte: 0 },
  )
}

export async function getGruppi(opzioni?: {
  citta?: string
  categoria?: string
  limite?: number
}): Promise<PublicCluster[]> {
  return conClient(
    'gruppi',
    async (sb) => {
      let query = sb
        .from('public_clusters')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(opzioni?.limite ?? 20)

      if (opzioni?.citta) query = query.eq('city', opzioni.citta)
      if (opzioni?.categoria) query = query.eq('category', opzioni.categoria)

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as PublicCluster[]
    },
    [],
  )
}

export async function getGruppo(id: string): Promise<PublicCluster | null> {
  return conClient(
    'gruppo',
    async (sb) => {
      const { data, error } = await sb
        .from('public_clusters')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      return (data as PublicCluster) ?? null
    },
    null,
  )
}

export async function getSegnalazioniDelGruppo(
  clusterId: string,
): Promise<PublicClusterReport[]> {
  return conClient(
    'segnalazioni-gruppo',
    async (sb) => {
      const { data, error } = await sb
        .from('public_cluster_reports')
        .select('*')
        .eq('cluster_id', clusterId)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []) as PublicClusterReport[]
    },
    [],
  )
}

export async function getAtti(opzioni?: {
  clusterId?: string
  limite?: number
}): Promise<PublicAction[]> {
  return conClient(
    'atti',
    async (sb) => {
      let query = sb
        .from('public_actions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(opzioni?.limite ?? 20)

      if (opzioni?.clusterId) query = query.eq('cluster_id', opzioni.clusterId)

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as PublicAction[]
    },
    [],
  )
}

export async function getAtto(id: string): Promise<PublicAction | null> {
  return conClient(
    'atto',
    async (sb) => {
      const { data, error } = await sb
        .from('public_actions')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      return (data as PublicAction) ?? null
    },
    null,
  )
}

export async function getStatisticheComuni(): Promise<PublicCityStats[]> {
  return conClient(
    'statistiche-comuni',
    async (sb) => {
      const { data, error } = await sb
        .from('public_city_stats')
        .select('*')
        .order('clusters_count', { ascending: false })
      if (error) throw error
      return (data ?? []) as PublicCityStats[]
    },
    [],
  )
}
