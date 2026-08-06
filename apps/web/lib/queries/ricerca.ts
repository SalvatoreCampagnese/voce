/**
 * Ricerca semantica sui gruppi già pubblici (PLAN2 §4.1).
 *
 * Serve a far incontrare le persone: chi cerca «buche in via Ferrari» deve
 * trovare i suoi vicini invece di aprire l'ennesimo problema parallelo. Meno
 * gruppi doppioni significa più voci sullo stesso atto, e un atto con venti
 * firme pesa quanto venti atti da una firma non pesano.
 *
 * Due vincoli danno la forma a questo file.
 *
 * 1. Si passa SOLO da `search_public_clusters`. La RPC `match_similar_reports`
 *    è riservata al service role: restituisce report_id e cluster_id, cioè
 *    permette di ricostruire chi ha segnalato cosa. Qui non entra mai.
 *
 * 2. La RPC non restituisce un punteggio di somiglianza, e non deve tornare.
 *    Un numero continuo calcolato su testi privati è un oracolo: si interroga
 *    per bisezione, cambiando una parola alla volta, finché non racconta ciò
 *    che l'anonimizzazione aveva tolto. Per questo `GruppoTrovato` non ha un
 *    campo `similarity` e l'interfaccia non mostra percentuali: l'unica cosa
 *    che si comunica è l'ordine, «questo somiglia di più».
 *
 * Ogni funzione degrada con grazia come in `lib/queries/public.ts`: se OpenAI
 * o Supabase non rispondono, la ricerca restituisce zero risultati e un log.
 * Una barra di ricerca che manda in errore 500 l'elenco dei gruppi è un modo
 * stupido di perdere un cittadino.
 *
 * **Solo server**: legge `OPENAI_API_KEY` tramite `getOpenAI()`.
 */

import { getOpenAI, MODEL_EMBED, EMBED_DIMENSIONS, stimaCostoEuro } from '@/lib/ai/openai'
import { createAnonSupabase } from '@/lib/supabase/anon'
import { logAiUsage, logger, serializeError } from '@/lib/utils/logger'

export interface GruppoTrovato {
  clusterId: string
  title: string
  summary: string
  category: string
  city: string
  neighborhood: string | null
  citizensCount: number
  reportsCount: number
}

export interface OpzioniRicerca {
  /** Restringe a un comune. Corrisponde a `filter_city` della RPC. */
  citta?: string
  /** Quanti gruppi restituire. La funzione SQL applica comunque un tetto di 20. */
  limite?: number
}

/**
 * Oltre questa lunghezza la query viene troncata prima di pagare l'embedding.
 * Nessuno cerca con 200 caratteri: chi li incolla sta facendo altro, e
 * l'embedding si paga a token anche quando la richiesta è un abuso.
 */
const MAX_CARATTERI_QUERY = 200

/** Sotto questa soglia una query non ha abbastanza contenuto per un embedding. */
const MIN_CARATTERI_QUERY = 3

const LIMITE_PREDEFINITO = 10

/**
 * Piccola cache in memoria delle query già viste.
 *
 * Una ricerca costa una chiamata a OpenAI. Quando un gruppo finisce sui
 * giornali, decine di persone cercano lo stesso testo nello stesso minuto: la
 * cache trasforma quell'ondata in un embedding solo. Vive nel processo, quindi
 * su Vercel è per istanza e si svuota da sola: è una riduzione di costo, non
 * una garanzia — il limite vero sta sulla route handler che espone la ricerca.
 */
const TTL_CACHE_MS = 5 * 60 * 1000
const MAX_VOCI_CACHE = 200

interface VoceCache {
  scadenza: number
  gruppi: GruppoTrovato[]
}

const cache = new Map<string, VoceCache>()

function leggiCache(chiave: string): GruppoTrovato[] | null {
  const voce = cache.get(chiave)
  if (!voce) return null
  if (voce.scadenza < Date.now()) {
    cache.delete(chiave)
    return null
  }
  return voce.gruppi
}

function scriviCache(chiave: string, gruppi: GruppoTrovato[]): void {
  // Map conserva l'ordine di inserimento: la prima chiave è la più vecchia.
  if (cache.size >= MAX_VOCI_CACHE) {
    const piuVecchia = cache.keys().next().value
    if (piuVecchia !== undefined) cache.delete(piuVecchia)
  }
  cache.set(chiave, { scadenza: Date.now() + TTL_CACHE_MS, gruppi })
}

/** Normalizza il testo per la chiave di cache: spazi e maiuscole non contano. */
function normalizza(testo: string): string {
  return testo.trim().replace(/\s+/g, ' ').slice(0, MAX_CARATTERI_QUERY)
}

/**
 * Cerca i gruppi pubblici che somigliano a un testo libero.
 *
 * I risultati arrivano già ordinati dal più pertinente: quell'ordine è l'unica
 * informazione sulla somiglianza che esce da qui, e va rispettato così com'è.
 *
 * @param testo la frase scritta dal cittadino, anche imprecisa
 * @returns elenco eventualmente vuoto. Non lancia mai.
 */
export async function cercaGruppi(
  testo: string,
  opzioni?: OpzioniRicerca,
): Promise<GruppoTrovato[]> {
  const query = normalizza(testo)
  if (query.length < MIN_CARATTERI_QUERY) return []

  const citta = opzioni?.citta?.trim() || undefined
  const limite = Math.min(Math.max(opzioni?.limite ?? LIMITE_PREDEFINITO, 1), 20)
  const chiaveCache = `${limite}|${citta ?? ''}|${query.toLowerCase()}`

  const dallaCache = leggiCache(chiaveCache)
  if (dallaCache) return dallaCache

  try {
    const openai = getOpenAI()
    const embedding = await openai.embeddings.create({
      model: MODEL_EMBED,
      input: query,
    })

    const vettore = embedding.data[0]?.embedding
    if (!vettore || vettore.length !== EMBED_DIMENSIONS) {
      // Non è un errore del cittadino: è una nostra incoerenza di modello.
      // Si logga e si restituisce vuoto, senza rompere la pagina.
      logger.error('ricerca.embedding_dimensione_inattesa', {
        dimensione: vettore?.length ?? 0,
        attesa: EMBED_DIMENSIONS,
      })
      return []
    }

    logAiUsage({
      model: MODEL_EMBED,
      operation: 'ricerca',
      input_tokens: embedding.usage?.prompt_tokens ?? 0,
      output_tokens: 0,
      cost_eur: stimaCostoEuro(MODEL_EMBED, embedding.usage?.prompt_tokens ?? 0),
    })

    const sb = createAnonSupabase()

    // Parametri NOMINATI, sempre: l'ordine degli argomenti di
    // search_public_clusters è diverso da quello di match_similar_reports, e
    // uno scambio posizionale (soglia al posto del limite) passerebbe
    // inosservato restituendo risultati plausibili ma sbagliati.
    //
    // `match_threshold` non viene passato di proposito. La funzione SQL applica
    // un pavimento alla soglia e un tetto al limite proprio per non lasciare al
    // chiamante la possibilità di allargare la ricerca: la soglia della ricerca
    // pubblica è una decisione del database, non dell'applicazione.
    const { data, error } = await sb.rpc('search_public_clusters', {
      query_embedding: JSON.stringify(vettore),
      match_count: limite,
      filter_city: citta,
    })

    if (error) throw error

    return scriviERestituisci(chiaveCache, data ?? [])
  } catch (errore) {
    // Gli errori di Supabase sono PostgrestError, non Error: `String(errore)`
    // darebbe "[object Object]" e nasconderebbe la causa.
    logger.error('ricerca.fallita', {
      caratteri_query: query.length,
      citta: citta ?? null,
      ...serializeError(errore),
    })
    return []
  }
}

type RigaRpc = {
  cluster_id: string
  title: string
  summary: string
  category: string
  city: string
  neighborhood: string | null
  citizens_count: number
  reports_count: number
}

function scriviERestituisci(chiave: string, righe: RigaRpc[]): GruppoTrovato[] {
  const gruppi: GruppoTrovato[] = righe.map((riga) => ({
    clusterId: riga.cluster_id,
    title: riga.title,
    summary: riga.summary,
    category: riga.category,
    city: riga.city,
    neighborhood: riga.neighborhood,
    citizensCount: Number(riga.citizens_count ?? 0),
    reportsCount: Number(riga.reports_count ?? 0),
  }))
  scriviCache(chiave, gruppi)
  return gruppi
}
