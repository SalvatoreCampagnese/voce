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
}

export function stimaCostoEuro(
  model: string,
  tokenInput: number,
  tokenOutput = 0,
): number {
  const p = PREZZI[model] ?? { input: 0, output: 0 }
  return (tokenInput / 1_000_000) * p.input + (tokenOutput / 1_000_000) * p.output
}
