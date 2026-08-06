import OpenAI from 'openai'
import { serverEnv } from '@/lib/config/env'

/**
 * Modelli usati da VOCE, in un posto solo.
 *
 * ATTENZIONE al modello di embedding: cambiarlo invalida TUTTI i vettori già
 * salvati (dimensioni e spazio semantico diversi) e richiede un ri-embedding
 * completo di report_embeddings. Non cambiarlo per curiosità.
 */
export const MODEL_TRIAGE = 'gpt-4o-mini'
export const MODEL_DOSSIER = 'gpt-4o-mini'
export const MODEL_EMBED = 'text-embedding-3-small'
export const EMBED_DIMENSIONS = 1536

/**
 * Trascrizione dei messaggi vocali (PLAN2 §2.1).
 *
 * È la funzione che fa entrare chi oggi resta fuori: un anziano che ha aspettato
 * otto ore al pronto soccorso non scrive tre paragrafi, manda trenta secondi di
 * voce. Si forza sempre `language: 'it'`: senza, il modello scambia il dialetto
 * per un'altra lingua e restituisce una trascrizione inventata.
 */
export const MODEL_TRANSCRIBE = 'gpt-4o-mini-transcribe'

/** Descrizione delle foto (PLAN2 §2.3). Stesso modello del triage, con visione. */
export const MODEL_VISION = 'gpt-4o-mini'

/**
 * Moderazione dei contenuti (PLAN2 §1.3). Gratuito.
 *
 * Non serve a censurare: serve a impedire che un insulto o un contenuto
 * diffamatorio finisca dentro un atto indirizzato a una Procura. Chi scatta
 * finisce in `quarantena`, che non cancella niente e chiede una revisione umana.
 */
export const MODEL_MODERATION = 'omni-moderation-latest'

/**
 * Secondo passaggio di anonimizzazione (PLAN2 §5.1).
 *
 * Volutamente un modello diverso da `MODEL_TRIAGE`: due modelli che sbagliano
 * allo stesso modo sono più rari di uno che sbaglia. Se un giorno i due
 * coincidessero, il secondo passaggio smetterebbe di essere una rete.
 */
export const MODEL_ANONIMIZZA = 'gpt-4o-mini'

let cached: OpenAI | null = null

export function getOpenAI(): OpenAI {
  if (!cached) {
    cached = new OpenAI({ apiKey: serverEnv.OPENAI_API_KEY, maxRetries: 3 })
  }
  return cached
}

/** Prezzi in euro per milione di token, per il contatore di spesa. */
const PREZZI: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.14, output: 0.56 },
  'text-embedding-3-small': { input: 0.019, output: 0 },
  // La trascrizione si paga a token di audio. Il valore è un ordine di
  // grandezza per il contatore, non un preventivo: prima di aprire i vocali a
  // un pilot vero, controlla il listino corrente e alza il limite di spesa
  // OpenAI (GUIDE.md passo 2).
  'gpt-4o-mini-transcribe': { input: 2.8, output: 9.3 },
  // La moderazione è gratuita: resta in tabella perché logAiUsage() registri
  // comunque la chiamata, altrimenti sembrerebbe che non sia mai stata fatta.
  'omni-moderation-latest': { input: 0, output: 0 },
}

/**
 * Costo stimato di una trascrizione, in euro.
 *
 * Il listino della trascrizione è al minuto di audio, non al token: questa
 * funzione tiene il calcolo in un posto solo invece di spargere una moltiplicazione
 * in mezzo al codice di ingestione.
 */
export const COSTO_TRASCRIZIONE_EURO_AL_MINUTO = 0.0028

export function stimaCostoTrascrizione(secondi: number): number {
  return (secondi / 60) * COSTO_TRASCRIZIONE_EURO_AL_MINUTO
}

export function stimaCostoEuro(
  model: string,
  tokenInput: number,
  tokenOutput = 0,
): number {
  const p = PREZZI[model] ?? { input: 0, output: 0 }
  return (tokenInput / 1_000_000) * p.input + (tokenOutput / 1_000_000) * p.output
}
