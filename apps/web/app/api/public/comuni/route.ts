import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { createAnonSupabase } from '@/lib/supabase/anon'
import { logger, serializeError } from '@/lib/utils/logger'

/**
 * Dati aperti — il confronto fra comuni (PLAN2 §6.1 e §6.2).
 *
 * Unisce `public_city_stats` (quanto è stato segnalato) e
 * `public_city_responsiveness` (quanto è stato risposto). Sono due viste
 * separate perché rispondono a due domande diverse, ma chi scarica i dati le
 * vuole sulla stessa riga: «Comune X: tanti gruppi, tanti atti, tante risposte,
 * in quanti giorni».
 *
 * Qui si valutano istituzioni, non persone. È il contrario esatto del punteggio
 * di attendibilità sui cittadini che PLAN2 §7 vieta: i numeri di questa rotta
 * misurano chi ha il potere di rispondere, mai chi ha segnalato.
 */

export const runtime = 'nodejs'

// ---------------------------------------------------------------------------
// Blocco comune alle quattro rotte pubbliche.
//
// Duplicato in `gruppi`, `atti`, `risposte` e `comuni` invece di stare in un
// modulo condiviso perché un file `route.ts` può esportare soltanto gli handler
// e la configurazione di segmento: qualunque altro export fa fallire la build.
// ---------------------------------------------------------------------------

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
} as const

const CACHE = 'public, s-maxage=300, stale-while-revalidate=3600'

const LICENZA = 'CC BY 4.0'
const LICENZA_URL = 'https://creativecommons.org/licenses/by/4.0/deed.it'

const SPIEGAZIONI: Record<string, string> = {
  formato: 'Usa formato=json oppure formato=csv.',
  citta: 'Indica il nome di un comune, da 1 a 100 caratteri.',
  limite: 'Indica un numero intero fra 1 e 1000.',
  offset: 'Indica un numero intero fra 0 e 100000.',
}

function parametriGrezzi(
  sp: URLSearchParams,
  chiavi: readonly string[],
): Record<string, string> {
  const grezzi: Record<string, string> = {}
  for (const chiave of chiavi) {
    const valore = sp.get(chiave)
    if (valore !== null && valore.trim() !== '') grezzi[chiave] = valore
  }
  return grezzi
}

function dettagliErrore(errore: z.ZodError): { parametro: string; messaggio: string }[] {
  const visti = new Set<string>()
  const dettagli: { parametro: string; messaggio: string }[] = []
  for (const problema of errore.issues) {
    const parametro = String(problema.path[0] ?? '(query)')
    if (visti.has(parametro)) continue
    visti.add(parametro)
    dettagli.push({ parametro, messaggio: SPIEGAZIONI[parametro] ?? 'Valore non valido.' })
  }
  return dettagli
}

function risposta400(dettagli: { parametro: string; messaggio: string }[]) {
  return NextResponse.json(
    { errore: 'Parametri non validi. Correggi e riprova.', dettagli },
    { status: 400, headers: { ...CORS, 'Cache-Control': 'no-store' } },
  )
}

function risposta503(dettaglio: string) {
  return NextResponse.json(
    { errore: 'Dati temporaneamente non disponibili.', dettaglio },
    { status: 503, headers: { ...CORS, 'Cache-Control': 'no-store' } },
  )
}

/**
 * Un campo CSV, sempre fra virgolette e con le virgolette interne raddoppiate
 * (RFC 4180). Il prefisso apostrofo evita che un valore che inizia con `=`,
 * `+`, `-` o `@` venga eseguito come formula da un foglio di calcolo: in un CSV
 * pubblico sarebbe codice che gira sul computer di chi lo scarica.
 */
function campoCsv(valore: unknown): string {
  if (valore === null || valore === undefined) return '""'
  const grezzo = typeof valore === 'object' ? JSON.stringify(valore) : String(valore)
  const sicuro = /^[=+\-@\t\r]/.test(grezzo) ? `'${grezzo}` : grezzo
  return `"${sicuro.replace(/"/g, '""')}"`
}

function componiCsv(
  colonne: readonly string[],
  righe: readonly Record<string, unknown>[],
): string {
  const linee = [colonne.map(campoCsv).join(',')]
  for (const riga of righe) linee.push(colonne.map((c) => campoCsv(riga[c])).join(','))
  // BOM UTF-8: senza, Excel in italiano apre "perché" come "perchÃ©".
  return `\uFEFF${linee.join('\r\n')}\r\n`
}

function rispostaCsv(
  nomeFile: string,
  colonne: readonly string[],
  righe: readonly Record<string, unknown>[],
) {
  return new Response(componiCsv(colonne, righe), {
    headers: {
      ...CORS,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nomeFile}"`,
      'Cache-Control': CACHE,
    },
  })
}

function giornoDiOggi(): string {
  return new Date().toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Parametri accettati da questa rotta
// ---------------------------------------------------------------------------

const CHIAVI = ['formato', 'citta', 'limite', 'offset'] as const

/**
 * Parametri che esistono sulle altre rotte ma qui non hanno senso: questa è una
 * fotografia aggregata, non un elenco di eventi datati. Rifiutarli è più onesto
 * che ignorarli: chi scrive `?dal=2026-01-01` crede di aver filtrato, e
 * pubblicherebbe un numero che non è quello che pensa di avere.
 */
const NON_APPLICABILI: Record<string, string> = {
  dal: 'Questa rotta restituisce totali complessivi: le date non si applicano. Usa /api/public/atti o /api/public/risposte.',
  al: 'Questa rotta restituisce totali complessivi: le date non si applicano. Usa /api/public/atti o /api/public/risposte.',
  categoria:
    'Questa rotta aggrega per comune, non per categoria. Usa /api/public/gruppi?categoria=…',
}

const SchemaParametri = z.object({
  formato: z.enum(['json', 'csv']).default('json'),
  citta: z.string().trim().min(1).max(100).optional(),
  limite: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
})

const COLONNE_COMUNI = [
  'comune',
  'gruppi',
  'segnalazioni',
  'cittadini',
  'atti_inviati',
  'risposte_ricevute',
  'risposte_confermate',
  'giorni_medi_di_risposta',
  'accolte',
  'respinte',
  'interlocutorie',
  'irricevibili',
] as const

/**
 * I comuni con dati pubblici sono pochi per costruzione — la soglia dei tre
 * cittadini ne esclude quasi tutti — quindi si leggono per intero e si uniscono
 * in memoria. Il tetto esiste solo perché nessuna lettura resti senza limite.
 */
const MAX_COMUNI = 1000

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams

  const dettagliNonApplicabili = Object.keys(NON_APPLICABILI)
    .filter((chiave) => (sp.get(chiave) ?? '').trim() !== '')
    .map((parametro) => ({ parametro, messaggio: NON_APPLICABILI[parametro]! }))

  if (dettagliNonApplicabili.length > 0) return risposta400(dettagliNonApplicabili)

  const analisi = SchemaParametri.safeParse(parametriGrezzi(sp, CHIAVI))
  if (!analisi.success) return risposta400(dettagliErrore(analisi.error))

  const { formato, citta, limite, offset } = analisi.data

  try {
    const sb = createAnonSupabase()

    let queryStats = sb
      .from('public_city_stats')
      .select('city,clusters_count,reports_count,citizens_count,actions_sent,responses_received')
      .order('city', { ascending: true })
      .limit(MAX_COMUNI)

    let queryRisposte = sb
      .from('public_city_responsiveness')
      .select(
        'city,actions_sent,responses_confirmed,avg_response_days,accolte,respinte,interlocutorie,irricevibili',
      )
      .order('city', { ascending: true })
      .limit(MAX_COMUNI)

    if (citta) {
      queryStats = queryStats.eq('city', citta)
      queryRisposte = queryRisposte.eq('city', citta)
    }

    const [stats, risposte] = await Promise.all([queryStats, queryRisposte])
    if (stats.error) throw stats.error
    if (risposte.error) throw risposte.error

    const perComune = new Map<
      string,
      {
        comune: string
        gruppi: number
        segnalazioni: number
        cittadini: number
        atti_inviati: number
        risposte_ricevute: number
        risposte_confermate: number
        giorni_medi_di_risposta: number | null
        accolte: number
        respinte: number
        interlocutorie: number
        irricevibili: number
      }
    >()

    for (const riga of stats.data ?? []) {
      if (!riga.city) continue
      perComune.set(riga.city, {
        comune: riga.city,
        gruppi: Number(riga.clusters_count ?? 0),
        segnalazioni: Number(riga.reports_count ?? 0),
        cittadini: Number(riga.citizens_count ?? 0),
        atti_inviati: Number(riga.actions_sent ?? 0),
        risposte_ricevute: Number(riga.responses_received ?? 0),
        risposte_confermate: 0,
        giorni_medi_di_risposta: null,
        accolte: 0,
        respinte: 0,
        interlocutorie: 0,
        irricevibili: 0,
      })
    }

    for (const riga of risposte.data ?? []) {
      if (!riga.city) continue
      // Un comune presente solo qui non dovrebbe esistere, ma se le due viste
      // divergono è meglio una riga in più con i totali a zero che un comune
      // che sparisce dai dati aperti senza che nessuno se ne accorga.
      const esistente = perComune.get(riga.city) ?? {
        comune: riga.city,
        gruppi: 0,
        segnalazioni: 0,
        cittadini: 0,
        atti_inviati: Number(riga.actions_sent ?? 0),
        risposte_ricevute: 0,
        risposte_confermate: 0,
        giorni_medi_di_risposta: null,
        accolte: 0,
        respinte: 0,
        interlocutorie: 0,
        irricevibili: 0,
      }

      esistente.risposte_confermate = Number(riga.responses_confirmed ?? 0)
      esistente.giorni_medi_di_risposta =
        riga.avg_response_days === null || riga.avg_response_days === undefined
          ? null
          : Number(riga.avg_response_days)
      esistente.accolte = Number(riga.accolte ?? 0)
      esistente.respinte = Number(riga.respinte ?? 0)
      esistente.interlocutorie = Number(riga.interlocutorie ?? 0)
      esistente.irricevibili = Number(riga.irricevibili ?? 0)

      perComune.set(riga.city, esistente)
    }

    const tutti = [...perComune.values()].sort(
      (a, b) => b.gruppi - a.gruppi || a.comune.localeCompare(b.comune, 'it'),
    )
    const righe = tutti.slice(offset, offset + limite)

    if (formato === 'csv') {
      return rispostaCsv(`voce-comuni-${giornoDiOggi()}.csv`, COLONNE_COMUNI, righe)
    }

    return NextResponse.json(
      {
        dati: righe,
        totale: tutti.length,
        restituiti: righe.length,
        limite,
        offset,
        generato_il: new Date().toISOString(),
        licenza: LICENZA,
        licenza_url: LICENZA_URL,
        nota:
          'Solo comuni con almeno un gruppo pubblico, cioè con almeno tre cittadini ' +
          'distinti. Le risposte contate sono quelle confermate da una persona.',
      },
      { headers: { ...CORS, 'Cache-Control': CACHE } },
    )
  } catch (errore) {
    logger.error('api.public.comuni.fallita', {
      citta: citta ?? null,
      ...serializeError(errore),
    })
    return risposta503('Riprova fra qualche minuto.')
  }
}
