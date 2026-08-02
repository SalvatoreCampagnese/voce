/**
 * Client Supabase legato alla sessione del cittadino.
 *
 * È quello da usare in Server Components, Server Actions e Route Handler che
 * agiscono *per conto* di un utente: le query passano dalla Row Level
 * Security, quindi nessuno può leggere le segnalazioni di un altro.
 *
 * Va creato **una volta per richiesta**: `cookies()` è legato alla richiesta in
 * corso e un client condiviso fra richieste servirebbe la sessione sbagliata.
 *
 * Nota Next.js 16: `cookies()` è asincrona, da cui la firma `Promise<...>`
 * fissata dal contratto §7.
 */

import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@voce/db/types'

import { publicEnv } from '@/lib/config/env'

export async function createServerSupabase(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // In un Server Component i cookie sono in sola lettura e `set`
            // lancia. Non è un errore da segnalare: è il caso previsto dalla
            // documentazione di @supabase/ssr. Il token rinnovato viene scritto
            // sulla risposta da `proxy.ts`, che gira prima del rendering.
            // Se un giorno gli utenti risultassero sloggati a caso, il colpevole
            // è il matcher del proxy che non copre più la rotta, non questo blocco.
          }
        },
      },
    },
  )
}
