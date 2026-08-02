/**
 * Client Supabase SENZA sessione, per le pagine pubbliche.
 *
 * Perché esiste, visto che c'è già `createServerSupabase`: quello legge i
 * cookie, e in Next.js leggere i cookie rende la pagina dinamica per forza.
 * Le pagine pubbliche di VOCE (home, elenco gruppi, quadro di trasparenza)
 * mostrano a tutti le stesse cose e leggono solo le viste `public_*`: non hanno
 * bisogno di sapere chi sei. Usando questo client restano cacheabili con ISR,
 * e reggono un'ondata di traffico — cioè esattamente il momento in cui un
 * gruppo finisce sui giornali e la gente arriva tutta insieme.
 *
 * Usa la chiave anon: passa dalla Row Level Security come un visitatore
 * qualsiasi. Non può leggere segnalazioni né identità.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@voce/db/types'

import { publicEnv } from '@/lib/config/env'

let cached: SupabaseClient<Database> | null = null

export function createAnonSupabase(): SupabaseClient<Database> {
  if (cached) return cached

  cached = createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: {
        // Nessuna sessione da mantenere: è un client di sola lettura pubblica.
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  )

  return cached
}
