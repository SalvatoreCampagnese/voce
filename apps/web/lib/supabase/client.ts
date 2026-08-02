/**
 * Client Supabase per il browser.
 *
 * Usa solo valori pubblici (URL del progetto e chiave anon): tutto ciò che
 * questo client può fare è già consentito dalle policy RLS a un utente
 * anonimo o alla sessione corrente.
 *
 * Serve per Realtime (contatori live del quadro pubblico) e per i flussi di
 * autenticazione OTP lato client. Per leggere o scrivere dati in una pagina,
 * preferisci sempre un Server Component con `createServerSupabase()`: meno
 * JavaScript nel browser e nessuna sorpresa di caching.
 *
 * `createBrowserClient` restituisce già un singleton per coppia URL/chiave,
 * quindi chiamare questa funzione più volte non apre più connessioni.
 */

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@voce/db/types'

import { publicEnv } from '@/lib/config/env'

export function createBrowserSupabase(): SupabaseClient<Database> {
  return createBrowserClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )
}
