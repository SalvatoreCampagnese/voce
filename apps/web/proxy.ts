/**
 * Proxy — in Next.js 16 il file `middleware.ts` non esiste più: si chiama
 * `proxy.ts`, sta nella stessa posizione (root dell'app) ed esporta `proxy`.
 * Il `runtime` non è configurabile qui: gira sempre su Node.js.
 * Fonte: `apps/web/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`
 *
 * Compito unico: rinfrescare la sessione Supabase e riscrivere i cookie
 * aggiornati sulla risposta. Senza questo passaggio i Server Components non
 * possono scrivere cookie e gli utenti risultano sloggati a caso.
 *
 * Non è un livello di autorizzazione: i controlli veri stanno nelle Server
 * Action, nei Route Handler e — soprattutto — nelle policy RLS del database.
 * Un matcher può smettere di coprire una rotta senza che nessuno se ne accorga.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

import { publicEnv } from '@/lib/config/env'
import { logger } from '@/lib/utils/logger'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          // I cookie vanno scritti sia sulla richiesta (li vedrà il rendering
          // che avviene dopo) sia sulla risposta (li vedrà il browser).
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }

          response = NextResponse.next({ request })

          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }

          // @supabase/ssr passa qui gli header anti-cache: una risposta che
          // imposta cookie di sessione non deve finire nella cache di un CDN,
          // altrimenti la sessione di una persona viene servita a un'altra.
          for (const [name, value] of Object.entries(headers)) {
            response.headers.set(name, value)
          }
        },
      },
    },
  )

  try {
    // Presto nella richiesta, e prima di generare la risposta: se il refresh
    // del token finisse dopo, `setAll` non avrebbe più dove scrivere e la
    // sessione andrebbe persa a ogni giro.
    await supabase.auth.getClaims()
  } catch (error) {
    // Se Supabase è irraggiungibile il sito deve restare in piedi: le pagine
    // pubbliche non hanno bisogno di sessione. L'errore viene loggato, mai
    // ingoiato in silenzio.
    logger.warn('proxy.session_refresh_failed', { error })
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Il proxy gira su tutto tranne:
     * - le rotte macchina-a-macchina (`/api/ingest`, `/api/cron`,
     *   `/api/internal`, `/api/public`), che si autenticano da sole con la
     *   propria firma o con un segreto e non hanno sessione da rinfrescare;
     * - gli asset statici e le immagini ottimizzate, dove il costo sarebbe
     *   puro spreco.
     *
     * Restano coperte le pagine, le Server Action (che sono POST sulla rotta
     * della pagina) e `/api/actions/[id]/sign`, che invece la sessione ce
     * l'ha e serve.
     *
     * `/admin` rientra fra le pagine coperte: il pattern esclude solo le rotte
     * elencate qui sopra, quindi il pannello passa di qui senza aggiungere
     * niente. Questo serve al pannello — l'accesso con codice via email crea la
     * sessione dentro una Server Action, e senza il rinfresco dei token
     * l'amministratore risulterebbe sloggato a caso — ma NON è ciò che protegge
     * il pannello: un matcher può smettere di coprire una rotta senza che
     * nessuno se ne accorga. A dire di no sono `richiediAdmin()` in ogni pagina
     * e, sotto, le policy RLS.
     */
    '/((?!api/ingest|api/cron|api/internal|api/public|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|fonts/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|ttf|otf)$).*)',
  ],
}
