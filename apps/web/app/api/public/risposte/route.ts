import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { createAnonSupabase } from '@/lib/supabase/anon'
import { logger, serializeError } from '@/lib/utils/logger'

/**
 * Dati aperti — le risposte della pubblica amministrazione (PLAN2 §6.1).
 *
 * È il dataset che dà senso agli altri due: senza, «quali comuni rispondono
 * davvero» resta un'opinione. Legge SOLO la vista `public_action_responses`,
 * che espone unicamente le righe già confermate da una persona — una
 * classificazione automatica sbagliata farebbe dichiarare qui, in un file che
 * qualcuno citerà, che un comune ha ignorato una richiesta a cui aveva risposto.
 *
 * Motivo e rimedio possono essere vuoti: la vista li prende dalle colonne
 * anonimizzate, e finché l'anonimizzazione non è passata restano null. Chi usa
 * questi dati deve saperlo, quindi è scritto nella `nota` della risposta.
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

const GIORNO = /^\d{4}-\d{2}-\d{2}$/

const SPIEGAZIONI: Record<string, string> = {
  formato: 'Usa formato=json oppure formato=csv.',
  citta: 'Indica il nome di un comune, da 1 a 100 caratteri.',
  esito: 'Esiti ammessi: accolta, respinta, interlocutoria, irricevibile.',
  dal: 'Usa una data reale nel formato AAAA-MM-GG, per esempio 2026-01-31.',
  al: 'Usa una data reale nel formato AAAA-MM-GG, per esempio 2026-01-31.',
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

function daInizioGiorno(giorno: string): string {
  return `${giorno}T00:00:00.000Z`
}

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

const CHIAVI = ['formato', 'citta', 'esito', 'dal', 'al', 'limite', 'offset'] as const

/**
 * Valori dell'enum `pa_response_class`, ripetuti qui per poter rispondere 400
 * con l'elenco degli esiti ammessi invece di lasciare che PostgREST fallisca su
 * un enum sconosciuto e l'API risponda 503.
 * Sorgente: `Constants.public.Enums.pa_response_class` in packages/db/src/types.ts.
 */
const ESITI = ['accolta', 'respinta', 'interlocutoria', 'irricevibile'] as const

const dataGiorno = z
  .string()
  .trim()
  .regex(GIORNO)
  .refine((valore) => !Number.isNaN(Date.parse(`${valore}T00:00:00.000Z`)))

const SchemaParametri = z.object({
  formato: z.enum(['json', 'csv']).default('json'),
  citta: z.string().trim().min(1).max(100).optional(),
  esito: z.enum(ESITI).optional(),
  dal: dataGiorno.optional(),
  al: dataGiorno.optional(),
  limite: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
})

/**
 * `reason` e `proposed_remedy` arrivano dalle colonne `_anon` della tabella:
 * quello grezzo resta privato e non passa da qui in nessun caso.
 */
const SELECT_RISPOSTE =
  'id,action_id,classification,reason,cites_art_5bis,proposed_remedy,received_at,confirmed_at'

const COLONNE_RISPOSTE = [
  'id',
  'atto_id',
  'esito',
  'motivo',
  'cita_art_5bis',
  'rimedio_proposto',
  'ricevuta_il',
  'confermata_il',
] as const

/**
 * Il comune non sta sulla risposta: sta sul gruppo, due salti più in là.
 * Filtrare per comune costa quindi due letture in più, entrambe sulle viste
 * pubbliche. Nessuna scorciatoia sulle tabelle, nemmeno per una giunzione.
 */
const MAX_RISOLTI = 1000

async function idAttiDelComune(
  sb: ReturnType<typeof createAnonSupabase>,
  citta: string,
): Promise<{ ids: string[]; troncato: boolean }> {
  const { data: gruppi, error: erroreGruppi } = await sb
    .from('public_clusters')
    .select('id')
    .eq('city', citta)
    .order('id', { ascending: true })
    .limit(MAX_RISOLTI)
  if (erroreGruppi) throw erroreGruppi

  const idGruppi = (gruppi ?? [])
    .map((riga) => riga.id)
    .filter((id): id is string => typeof id === 'string')

  if (idGruppi.length === 0) return { ids: [], troncato: false }

  const { data: atti, error: erroreAtti } = await sb
    .from('public_actions')
    .select('id')
    .in('cluster_id', idGruppi)
    .order('id', { ascending: true })
    .limit(MAX_RISOLTI)
  if (erroreAtti) throw erroreAtti

  const ids = (atti ?? [])
    .map((riga) => riga.id)
    .filter((id): id is string => typeof id === 'string')

  return {
    ids,
    troncato: idGruppi.length === MAX_RISOLTI || ids.length === MAX_RISOLTI,
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function GET(req: NextRequest) {
  const analisi = SchemaParametri.safeParse(
    parametriGrezzi(req.nextUrl.searchParams, CHIAVI),
  )
  if (!analisi.success) return risposta400(dettagliErrore(analisi.error))

  const { formato, citta, esito, dal, al, limite, offset } = analisi.data

  try {
    const sb = createAnonSupabase()

    let troncato = false
    let idAtti: string[] | null = null

    if (citta) {
      const risolti = await idAttiDelComune(sb, citta)
      idAtti = risolti.ids
      troncato = risolti.troncato
    }

    if (idAtti !== null && idAtti.length === 0) {
      if (formato === 'csv') {
        return rispostaCsv(`voce-risposte-${giornoDiOggi()}.csv`, COLONNE_RISPOSTE, [])
      }
      return NextResponse.json(
        {
          dati: [],
          totale: 0,
          restituiti: 0,
          limite,
          offset,
          generato_il: new Date().toISOString(),
          licenza: LICENZA,
          licenza_url: LICENZA_URL,
          nota: 'Nessun atto pubblico nel comune indicato, quindi nessuna risposta.',
        },
        { headers: { ...CORS, 'Cache-Control': CACHE } },
      )
    }

    let query = sb
      .from('public_action_responses')
      .select(SELECT_RISPOSTE, { count: 'exact' })
      // Il secondo criterio rende stabile la paginazione: le date sono troncate
      // al giorno, quindi i pari merito sono la regola, non l'eccezione.
      .order('received_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + limite - 1)

    if (idAtti !== null) query = query.in('action_id', idAtti)
    if (esito) query = query.eq('classification', esito)
    if (dal) query = query.gte('received_at', daInizioGiorno(dal))
    if (al) query = query.lt('received_at', aFineGiorno(al))

    const { data, error, count } = await query
    if (error) throw error

    const righe = (data ?? []).map((risposta) => ({
      id: risposta.id,
      atto_id: risposta.action_id,
      esito: risposta.classification,
      motivo: risposta.reason,
      cita_art_5bis: risposta.cites_art_5bis,
      rimedio_proposto: risposta.proposed_remedy,
      ricevuta_il: risposta.received_at,
      confermata_il: risposta.confirmed_at,
    }))

    if (formato === 'csv') {
      return rispostaCsv(`voce-risposte-${giornoDiOggi()}.csv`, COLONNE_RISPOSTE, righe)
    }

    const nota =
      'Solo risposte la cui classificazione è stata confermata da una persona. ' +
      'Motivo e rimedio sono vuoti finché non sono stati anonimizzati.' +
      (troncato ? ` Il filtro per comune ha considerato i primi ${MAX_RISOLTI} elementi.` : '')

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
        nota,
      },
      { headers: { ...CORS, 'Cache-Control': CACHE } },
    )
  } catch (errore) {
    logger.error('api.public.risposte.fallita', {
      citta: citta ?? null,
      ...serializeError(errore),
    })
    return risposta503('Riprova fra qualche minuto.')
  }
}
