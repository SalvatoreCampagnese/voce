import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { createAnonSupabase } from '@/lib/supabase/anon'
import { logger, serializeError } from '@/lib/utils/logger'

/**
 * Dati aperti — i gruppi (PLAN2 §6.1).
 *
 * Senza autenticazione, ed è il punto: servono a giornalisti e ricercatori, e
 * sono la prova che VOCE non nasconde niente. Chi vuole verificare che i numeri
 * mostrati in pagina siano veri deve poterli scaricare senza chiedere permesso
 * a nessuno.
 *
 * Legge SOLO la vista `public_clusters` con la chiave anon. Non è pigrizia: è
 * la ragione per cui questa route non ha bisogno di controlli propri sulla
 * privacy. La vista applica già la soglia dei tre cittadini, esclude i gruppi
 * sintetici, arrotonda il centroide con `blur_point()` e tronca le date all'ora.
 * Nessuna riga di questo file può indebolire quelle garanzie, perché nessuna
 * riga di questo file tocca una tabella.
 */

// Node.js ovunque nel progetto: nessun `runtime = 'edge'`.
export const runtime = 'nodejs'

// ---------------------------------------------------------------------------
// Blocco comune alle quattro rotte pubbliche.
//
// È duplicato in `gruppi`, `atti`, `risposte` e `comuni` invece di stare in un
// modulo condiviso perché un file `route.ts` può esportare soltanto gli handler
// e la configurazione di segmento: qualunque altro export fa fallire la build.
// La duplicazione è voluta e va tenuta allineata a mano.
// ---------------------------------------------------------------------------

const CORS = {
  // Sono dati pubblici: il punto è che chiunque li usi, anche da un notebook
  // servito su un altro dominio.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
} as const

const CACHE = 'public, s-maxage=300, stale-while-revalidate=3600'

const LICENZA = 'CC BY 4.0'
const LICENZA_URL = 'https://creativecommons.org/licenses/by/4.0/deed.it'

/** Data nel formato AAAA-MM-GG. Il fuso è UTC, ed è scritto in /dati. */
const GIORNO = /^\d{4}-\d{2}-\d{2}$/

/**
 * Messaggi d'errore scritti a mano, uno per parametro.
 *
 * Non si usano quelli di Zod: sono in inglese e parlano di tipi, mentre a chi
 * sta costruendo una query serve sapere cosa scrivere al posto di quello che ha
 * scritto.
 */
const SPIEGAZIONI: Record<string, string> = {
  formato: 'Usa formato=json oppure formato=csv.',
  citta: 'Indica il nome di un comune, da 1 a 100 caratteri.',
  categoria: 'Indica una sola categoria, da 1 a 60 caratteri.',
  dal: 'Usa una data reale nel formato AAAA-MM-GG, per esempio 2026-01-31.',
  al: 'Usa una data reale nel formato AAAA-MM-GG, per esempio 2026-01-31.',
  limite: 'Indica un numero intero fra 1 e 1000.',
  offset: 'Indica un numero intero fra 0 e 100000.',
}

/** Prende dalla query solo le chiavi note e non vuote, così i default valgono. */
function parametriGrezzi(
  sp: URLSearchParams,
  chiavi: readonly string[],
): Record<string, string> {
  const grezzi: Record<string, string> = {}
  for (const chiave of chiavi) {
    const valore = sp.get(chiave)
    // `?citta=` senza valore è una svista di chi compone l'URL, non un errore
    // da restituire: si tratta come parametro assente.
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
    dettagli.push({
      parametro,
      messaggio: SPIEGAZIONI[parametro] ?? 'Valore non valido.',
    })
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
 * (RFC 4180).
 *
 * Il prefisso apostrofo non è un vezzo: un valore che inizia con `=`, `+`, `-`
 * o `@` viene interpretato come formula quando il file si apre in un foglio di
 * calcolo. In un CSV pubblico sarebbe codice che gira sul computer di chi lo
 * scarica, e chi lo scarica qui è un giornalista.
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

/** Inizio del giorno indicato, in UTC. */
function daInizioGiorno(giorno: string): string {
  return `${giorno}T00:00:00.000Z`
}

/** Istante subito dopo la fine del giorno indicato: `al` è inclusivo. */
function aFineGiorno(giorno: string): string {
  const data = new Date(`${giorno}T00:00:00.000Z`)
  data.setUTCDate(data.getUTCDate() + 1)
  return data.toISOString()
}

function giornoDiOggi(): string {
  return new Date().toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Parametri accettati da questa rotta
// ---------------------------------------------------------------------------

const CHIAVI = ['formato', 'citta', 'categoria', 'dal', 'al', 'limite', 'offset'] as const

const dataGiorno = z
  .string()
  .trim()
  .regex(GIORNO)
  // Il regex accetta 2026-02-31: `Date.parse` di una stringa ISO no.
  .refine((valore) => !Number.isNaN(Date.parse(`${valore}T00:00:00.000Z`)))

const SchemaParametri = z.object({
  formato: z.enum(['json', 'csv']).default('json'),
  citta: z.string().trim().min(1).max(100).optional(),
  categoria: z.string().trim().min(1).max(60).optional(),
  dal: dataGiorno.optional(),
  al: dataGiorno.optional(),
  // Tetto a 1000 righe per richiesta: oltre, la pagina si scarica con `offset`.
  // Un tetto esplicito è più onesto di un timeout.
  limite: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
})

/**
 * Colonne esposte, elencate a mano.
 *
 * Non si usa `select('*')`: il giorno in cui qualcuno aggiunge una colonna alla
 * vista, un `*` la pubblicherebbe in un'API aperta senza che nessuno lo abbia
 * deciso. Qui una colonna nuova compare solo se qualcuno la scrive in questa
 * lista.
 */
const SELECT_GRUPPI =
  'id,title,summary,category,city,neighborhood,reports_count,citizens_count,status,centroid,radius_meters,threshold_reached_at,created_at,updated_at'

const COLONNE_GRUPPI = [
  'id',
  'titolo',
  'riassunto',
  'categoria',
  'comune',
  'quartiere',
  'segnalazioni',
  'cittadini',
  'stato',
  'latitudine',
  'longitudine',
  'raggio_metri',
  'soglia_raggiunta_il',
  'creato_il',
  'aggiornato_il',
] as const

/**
 * Il centroide arriva da PostgREST come EWKB esadecimale (l'output nativo di
 * PostGIS). In un file di dati aperti sarebbe illeggibile, quindi si decodifica
 * in latitudine e longitudine.
 *
 * Decodificarlo non espone niente di più: la vista restituisce già il punto
 * passato da `blur_point()`, cioè arrotondato a ~300 m. Si accetta anche la
 * forma GeoJSON nel caso PostgREST venga configurato per restituirla.
 */
function puntoLeggibile(valore: unknown): { lat: number; lng: number } | null {
  if (valore && typeof valore === 'object') {
    const geo = valore as { type?: unknown; coordinates?: unknown }
    if (geo.type === 'Point' && Array.isArray(geo.coordinates)) {
      const [lng, lat] = geo.coordinates as unknown[]
      if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng }
    }
    return null
  }

  if (typeof valore !== 'string' || !/^[0-9a-fA-F]+$/.test(valore)) return null

  const byte = Buffer.from(valore, 'hex')
  if (byte.length < 21) return null

  const littleEndian = byte.readUInt8(0) === 1
  const tipo = littleEndian ? byte.readUInt32LE(1) : byte.readUInt32BE(1)
  // Solo i punti: un poligono qui sarebbe un errore di modellazione, non un dato.
  if ((tipo & 0xffff) !== 1) return null

  const conSrid = (tipo & 0x2000_0000) !== 0
  const inizio = 5 + (conSrid ? 4 : 0)
  if (byte.length < inizio + 16) return null

  const lng = littleEndian ? byte.readDoubleLE(inizio) : byte.readDoubleBE(inizio)
  const lat = littleEndian ? byte.readDoubleLE(inizio + 8) : byte.readDoubleBE(inizio + 8)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  return { lat, lng }
}

/** Cinque decimali sono già oltre la precisione reale del dato arrotondato. */
function arrotonda(valore: number): number {
  return Math.round(valore * 100_000) / 100_000
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function GET(req: NextRequest) {
  const analisi = SchemaParametri.safeParse(
    parametriGrezzi(req.nextUrl.searchParams, CHIAVI),
  )
  if (!analisi.success) return risposta400(dettagliErrore(analisi.error))

  const { formato, citta, categoria, dal, al, limite, offset } = analisi.data

  try {
    const sb = createAnonSupabase()

    let query = sb
      .from('public_clusters')
      .select(SELECT_GRUPPI, { count: 'exact' })
      // Il secondo criterio non è decorativo: senza un ordinamento univoco, due
      // gruppi aggiornati nello stesso istante possono comparire due volte o
      // sparire fra una pagina e l'altra.
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + limite - 1)

    if (citta) query = query.eq('city', citta)
    if (categoria) query = query.eq('category', categoria)
    if (dal) query = query.gte('created_at', daInizioGiorno(dal))
    if (al) query = query.lt('created_at', aFineGiorno(al))

    const { data, error, count } = await query
    if (error) throw error

    const righe = (data ?? []).map((gruppo) => {
      const punto = puntoLeggibile(gruppo.centroid)
      return {
        id: gruppo.id,
        titolo: gruppo.title,
        riassunto: gruppo.summary,
        categoria: gruppo.category,
        comune: gruppo.city,
        quartiere: gruppo.neighborhood,
        segnalazioni: gruppo.reports_count,
        cittadini: gruppo.citizens_count,
        stato: gruppo.status,
        latitudine: punto ? arrotonda(punto.lat) : null,
        longitudine: punto ? arrotonda(punto.lng) : null,
        raggio_metri: gruppo.radius_meters,
        soglia_raggiunta_il: gruppo.threshold_reached_at,
        creato_il: gruppo.created_at,
        aggiornato_il: gruppo.updated_at,
      }
    })

    if (formato === 'csv') {
      return rispostaCsv(`voce-gruppi-${giornoDiOggi()}.csv`, COLONNE_GRUPPI, righe)
    }

    return NextResponse.json(
      {
        dati: righe,
        totale: count ?? righe.length,
        restituiti: righe.length,
        limite,
        offset,
        generato_il: new Date().toISOString(),
        licenza: LICENZA,
        licenza_url: LICENZA_URL,
        nota:
          'Solo gruppi con almeno tre cittadini distinti. Coordinate arrotondate ' +
          'a circa 300 metri, date troncate all’ora. Nessun testo di segnalazione.',
      },
      { headers: { ...CORS, 'Cache-Control': CACHE } },
    )
  } catch (errore) {
    logger.error('api.public.gruppi.fallita', {
      citta: citta ?? null,
      ...serializeError(errore),
    })
    return risposta503('Riprova fra qualche minuto.')
  }
}
