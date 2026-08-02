/**
 * Log strutturati in JSON, una riga per evento.
 *
 * Su Vercel ogni riga stampata su stdout/stderr finisce nei log della funzione:
 * scrivendo JSON con campi stabili si possono correlare le fasi di una stessa
 * segnalazione (`report_id`) o di uno stesso gruppo (`cluster_id`) senza
 * aggiungere un servizio esterno.
 *
 * Uso tipico:
 *
 * ```ts
 * const log = logger.child({ report_id: reportId, channel: 'telegram' })
 * log.info('ingest.report_created')
 * log.error('triage.failed', { error })
 * ```
 *
 * Il modulo non ha dipendenze: può essere importato da `proxy.ts`, da un Route
 * Handler, da un Server Component o da un Client Component.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/**
 * Campi di correlazione. Sono opzionali e tutti sullo stesso piano: un log
 * annidato è un log che nessuno riesce a filtrare.
 */
export interface LogContext {
  report_id?: string | null
  cluster_id?: string | null
  action_id?: string | null
  citizen_id?: string | null
  channel?: string | null
  job?: string | null
  request_id?: string | null
  duration_ms?: number
  error?: unknown
  [field: string]: unknown
}

export interface Logger {
  debug(event: string, context?: LogContext): void
  info(event: string, context?: LogContext): void
  warn(event: string, context?: LogContext): void
  error(event: string, context?: LogContext): void
  /** Restituisce un logger che ripete sempre i campi passati qui. */
  child(context: LogContext): Logger
}

/**
 * `NODE_ENV` non è un segreto e non compare nel contratto §6: è l'unica
 * lettura diretta di `process.env` ammessa fuori da lib/config/env, e serve a
 * tenere questo modulo senza dipendenze.
 */
const isProduction = process.env.NODE_ENV === 'production'

const REDACTED_VALUE = '[omesso]'

/**
 * Campi che non finiscono mai in un log: dati personali di un cittadino o
 * credenziali. `raw_text` è il testo grezzo della segnalazione — può contenere
 * nomi, indirizzi e condizioni di salute.
 */
const REDACTED_FIELDS = new Set([
  'raw_text',
  'text',
  'body',
  'phone',
  'phone_e164',
  'email',
  'telegram_id',
  'ip',
  'ip_address',
  'embedding',
  'authorization',
  'password',
])

const REDACTED_SUFFIXES = ['_token', '_secret', '_key', 'token', 'secret', 'apikey']

function isRedacted(field: string): boolean {
  const normalized = field.toLowerCase()
  if (REDACTED_FIELDS.has(normalized)) return true
  return REDACTED_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
}

/** Riduce un errore sconosciuto a qualcosa che si può serializzare e leggere. */
export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      // In produzione lo stack resta utile: i log di Vercel non sono pubblici.
      stack: error.stack,
      ...(error.cause === undefined ? {} : { cause: String(error.cause) }),
    }
  }
  if (typeof error === 'string') return { message: error }

  // Gli errori di Supabase/PostgREST NON sono istanze di Error: sono oggetti
  // semplici con message/code/details/hint. Con `String(error)` diventavano
  // "[object Object]" e la causa vera spariva proprio nei log in cui serviva.
  if (error !== null && typeof error === 'object') {
    const o = error as Record<string, unknown>
    const estratto: Record<string, unknown> = {}
    for (const campo of ['message', 'code', 'details', 'hint', 'name', 'status']) {
      if (o[campo] !== undefined) estratto[campo] = o[campo]
    }
    if (Object.keys(estratto).length > 0) return estratto

    // Oggetto senza campi noti: meglio il JSON che "[object Object]".
    try {
      return { message: JSON.stringify(error).slice(0, 500) }
    } catch {
      return { message: Object.prototype.toString.call(error) }
    }
  }

  return { message: String(error) }
}

function buildPayload(level: LogLevel, event: string, context: LogContext): string {
  const payload: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    event,
  }

  for (const [field, value] of Object.entries(context)) {
    if (value === undefined) continue
    if (field === 'error') {
      payload.error = serializeError(value)
      continue
    }
    payload[field] = isRedacted(field) ? REDACTED_VALUE : value
  }

  try {
    return JSON.stringify(payload)
  } catch {
    // Riferimenti circolari o BigInt: meglio un log povero che nessun log.
    return JSON.stringify({
      ts: payload.ts,
      level,
      event,
      note: 'contesto non serializzabile',
    })
  }
}

function emit(level: LogLevel, event: string, context: LogContext): void {
  if (level === 'debug' && isProduction) return

  const line = buildPayload(level, event, context)
  if (level === 'error' || level === 'warn') {
    console.error(line)
  } else {
    console.log(line)
  }
}

function createLogger(base: LogContext): Logger {
  return {
    debug: (event, context) => emit('debug', event, { ...base, ...context }),
    info: (event, context) => emit('info', event, { ...base, ...context }),
    warn: (event, context) => emit('warn', event, { ...base, ...context }),
    error: (event, context) => emit('error', event, { ...base, ...context }),
    child: (context) => createLogger({ ...base, ...context }),
  }
}

/** Logger di base. Per correlare più righe usa `logger.child({ report_id })`. */
export const logger: Logger = createLogger({})

/**
 * Consumo di un modello OpenAI, in una riga per chiamata.
 *
 * Il budget dell'MVP è ~15 € in totale: senza un contatore la spesa si scopre
 * a fine mese. Emettendo sempre questo evento la somma giornaliera si ottiene
 * dai log senza aggiungere infrastruttura:
 *
 * ```sh
 * vercel logs --json | grep '"event":"ai.usage"' | jq -s 'map(.cost_eur) | add'
 * ```
 */
export interface AiUsage {
  /** Nome del modello, es. `gpt-4o-mini` o `text-embedding-3-small`. */
  model: string
  /** Operazione applicativa: `triage`, `dossier`, `embedding`, `moderation`. */
  operation: string
  input_tokens: number
  output_tokens?: number
  /** Costo stimato in euro della singola chiamata. */
  cost_eur: number
  report_id?: string
  cluster_id?: string
}

export function logAiUsage(usage: AiUsage): void {
  emit('info', 'ai.usage', { ...usage })
}
