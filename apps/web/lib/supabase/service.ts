/**
 * Client Supabase con **service role**: bypassa la Row Level Security.
 *
 * ⚠️ SOLO SERVER. La `SUPABASE_SERVICE_ROLE_KEY` non compare da nessun'altra
 * parte del codice e non deve mai raggiungere il browser: chi la possiede
 * legge e riscrive ogni riga di ogni cittadino.
 *
 * Regole d'uso:
 * - va bene nei webhook di ingestione (il cittadino non ha una sessione),
 *   negli endpoint interni e nei cron;
 * - **non** va usata per servire una pagina a un utente loggato: lì si usa
 *   `createServerSupabase()`, che rispetta la RLS ed è la vera difesa contro
 *   la lettura dei dati altrui;
 * - non importare questo modulo da un file marcato `'use client'`.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@voce/db/types'

import { publicEnv, serverEnv } from '@/lib/config/env'

let cachedClient: SupabaseClient<Database> | null = null

export function createServiceClient(): SupabaseClient<Database> {
  if (typeof window !== 'undefined') {
    throw new Error(
      'createServiceClient() è stato invocato nel browser. La service role key non ' +
        'esiste lato client: usa createBrowserSupabase() oppure sposta la chiamata sul server.',
    )
  }

  // Il client con service role non ha stato di sessione, quindi riusarlo fra
  // richieste della stessa istanza serverless è sicuro e risparmia un handshake.
  if (cachedClient) return cachedClient

  cachedClient = createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        // Nessuna sessione da persistere o rinfrescare: è una chiave di servizio.
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: { 'x-voce-client': 'service' },
      },
    },
  )

  return cachedClient
}
