import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { createAnonSupabase } from '@/lib/supabase/anon'
import { logger, serializeError } from '@/lib/utils/logger'

/**
 * Dati aperti — gli atti civici (PLAN2 §6.1).
 *
 * Legge SOLO la vista `public_actions` con la chiave anon, e da lì derivano
 * senza sforzo tutte le garanzie che contano: niente atti sintetici, soglia dei
 * tre cittadini, e soprattutto il corpo dell'atto (`body_markdown`) esposto solo
 * quando una persona lo ha revisionato firmando con nome e cognome. Una bozza
 * generata da un modello non esce da qui, esattamente come non esce dalle
 * pagine del sito.
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
  tipo:
    'Tipi ammessi: esposto_procura, accesso_civico, segnalazione_difensore_civico, ' +
    'mozione_consigliere, dossier_giornalistico, diffida_pa, sollecito, riesame_accesso_civico.',
  stato: 'Stati ammessi: bozza, in_firma, inviata, risposta_ricevuta, archiviata.',
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

const CHIAVI = ['formato', 'citta', 'tipo', 'stato', 'dal', 'al', 'limite', 'offset'] as const

/**
 * Valori dell'enum `action_kind` e `action_status`, ripetuti qui per poter
 * rispondere 400 con l'elenco dei valori ammessi invece di lasciare che
 * PostgREST fallisca su un enum sconosciuto e l'API risponda 503.
 * Sorgente: `Constants.public.Enums` in packages/db/src/types.ts.
 */
const TIPI_ATTO = [
  'esposto_procura',
  'accesso_civico',
  'segnalazione_difensore_civico',
  'mozione_consigliere',
  'dossier_giornalistico',
  'diffida_pa',
  'sollecito',
  'riesame_accesso_civico',
] as const

const STATI_ATTO = ['bozza', 'in_firma', 'inviata', 'risposta_ricevuta', 'archiviata'] as const

const dataGiorno = z
  .string()
  .trim()
  .regex(GIORNO)
  .refine((valore) => !Number.isNaN(Date.parse(`${valore}T00:00:00.000Z`)))

const SchemaParametri = z.object({
  formato: z.enum(['json', 'csv']).default('json'),
  citta: z.string().trim().min(1).max(100).optional(),
  tipo: z.enum(TIPI_ATTO).optional(),
  stato: z.enum(STATI_ATTO).optional(),
  dal: dataGiorno.optional(),
  al: dataGiorno.optional(),
  limite: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
})

/**
 * Colonne elencate a mano, non `select('*')`: una colonna aggiunta domani alla
 * vista non deve comparire in un'API aperta senza che qualcuno lo decida.
 *
 * Deve restare una stringa letterale su una riga sola: supabase-js ricava i tipi
 * delle righe dal testo del select, e spezzarla con una concatenazione fa
 * ricadere tutto su `GenericStringError`.
 */
const SELECT_ATTI = 'id,cluster_id,kind,status,title,body_markdown,revisionato,reviewed_by,recipient,signatures_count,signatures_target,submitted_at,response_received_at,response_text,deadline_at,deadline_days,deadline_basis,follow_up_of_action_id,pdf_url,docx_url,created_at'

const COLONNE_ATTI = [
  'id',
  'gruppo_id',
  'tipo',
  'stato',
  'titolo',
  'destinatario',
  'revisionato',
  'revisionato_da',
  'firme',
  'firme_obiettivo',
  'inviato_il',
  'risposta_ricevuta_il',
  'termine_il',
  'termine_giorni',
  'termine_base',
  'seguito_di',
  'creato_il',
  'pdf_url',
  'docx_url',
  'testo_markdown',
  'testo_risposta',
] as const

/**
 * `public_actions` non ha una colonna `city`: il comune sta sul gruppo. Per
 * filtrare si risolvono prima gli identificativi dei gruppi pubblici di quel
 * comune. Due query invece di una giunzione: resta tutto dentro le viste
 * pubbliche, che è la condizione da non violare.
 */
const MAX_GRUPPI_RISOLTI = 1000

async function idGruppiDelComune(
  sb: ReturnType<typeof createAnonSupabase>,
  citta: string,
): Promise<{ ids: string[]; troncato: boolean }> {
  const { data, error } = await sb
    .from('public_clusters')
    .select('id')
    .eq('city', citta)
    .order('id', { ascending: true })
    .limit(MAX_GRUPPI_RISOLTI)
  if (error) throw error

  const ids = (data ?? [])
    .map((riga) => riga.id)
    .filter((id): id is string => typeof id === 'string')

  return { ids, troncato: ids.length === MAX_GRUPPI_RISOLTI }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function GET(req: NextRequest) {
  const analisi = SchemaParametri.safeParse(
    parametriGrezzi(req.nextUrl.searchParams, CHIAVI),
  )
  if (!analisi.success) return risposta400(dettagliErrore(analisi.error))

  const { formato, citta, tipo, stato, dal, al, limite, offset } = analisi.data

  try {
    const sb = createAnonSupabase()

    let gruppiTroncati = false
    let idGruppi: string[] | null = null

    if (citta) {
      const esito = await idGruppiDelComune(sb, citta)
      idGruppi = esito.ids
      gruppiTroncati = esito.troncato
    }

    // Nessun gruppo pubblico in quel comune: nessun atto pubblico, e non serve
    // interrogare il database per scoprirlo.
    if (idGruppi !== null && idGruppi.length === 0) {
      if (formato === 'csv') {
        return rispostaCsv(`voce-atti-${giornoDiOggi()}.csv`, COLONNE_ATTI, [])
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
          nota: `Nessun gruppo pubblico nel comune indicato, quindi nessun atto.`,
        },
        { headers: { ...CORS, 'Cache-Control': CACHE } },
      )
    }

    let query = sb
      .from('public_actions')
      .select(SELECT_ATTI, { count: 'exact' })
      // Il secondo criterio rende la paginazione stabile: senza, due atti creati
      // nella stessa ora possono comparire due volte o sparire fra le pagine.
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + limite - 1)

    if (idGruppi !== null) query = query.in('cluster_id', idGruppi)
    if (tipo) query = query.eq('kind', tipo)
    if (stato) query = query.eq('status', stato)
    if (dal) query = query.gte('created_at', daInizioGiorno(dal))
    if (al) query = query.lt('created_at', aFineGiorno(al))

    const { data, error, count } = await query
    if (error) throw error

    const righe = (data ?? []).map((atto) => ({
      id: atto.id,
      gruppo_id: atto.cluster_id,
      tipo: atto.kind,
      stato: atto.status,
      titolo: atto.title,
      destinatario: atto.recipient,
      revisionato: atto.revisionato,
      revisionato_da: atto.reviewed_by,
      firme: atto.signatures_count,
      firme_obiettivo: atto.signatures_target,
      inviato_il: atto.submitted_at,
      risposta_ricevuta_il: atto.response_received_at,
      termine_il: atto.deadline_at,
      termine_giorni: atto.deadline_days,
      termine_base: atto.deadline_basis,
      seguito_di: atto.follow_up_of_action_id,
      creato_il: atto.created_at,
      pdf_url: atto.pdf_url,
      docx_url: atto.docx_url,
      // Null finché nessuno lo ha revisionato: è la vista a deciderlo, non noi.
      testo_markdown: atto.body_markdown,
      testo_risposta: atto.response_text,
    }))

    if (formato === 'csv') {
      return rispostaCsv(`voce-atti-${giornoDiOggi()}.csv`, COLONNE_ATTI, righe)
    }

    const nota =
      'Il testo dell’atto compare solo dopo la revisione umana: negli altri casi ' +
      'testo_markdown è vuoto. Solo atti di gruppi con almeno tre cittadini distinti.' +
      (gruppiTroncati
        ? ` Il filtro per comune ha considerato i primi ${MAX_GRUPPI_RISOLTI} gruppi.`
        : '')

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
    logger.error('api.public.atti.fallita', {
      citta: citta ?? null,
      ...serializeError(errore),
    })
    return risposta503('Riprova fra qualche minuto.')
  }
}
