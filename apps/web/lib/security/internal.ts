/**
 * Autenticazione delle chiamate che non arrivano da un cittadino:
 * endpoint interni (server → server) e cron di Vercel.
 *
 * Il confronto dei segreti è a **tempo costante**. Un confronto con `===` esce
 * al primo byte diverso: misurando i tempi di risposta si ricostruisce il
 * segreto un carattere alla volta. Con `timingSafeEqual` il costo è lo stesso
 * per ogni input.
 *
 * `timingSafeEqual` lancia se i due buffer hanno lunghezza diversa: il caso è
 * gestito esplicitamente in `constantTimeEquals`, senza scorciatoie che
 * reintroducano una differenza di tempo osservabile.
 *
 * **Solo server** (`node:crypto` + segreti).
 */

import { timingSafeEqual } from 'node:crypto'

import { serverEnv } from '@/lib/config/env'

/** Header usato dalle chiamate interne server → server. */
export const INTERNAL_KEY_HEADER = 'x-internal-key'

/**
 * Errore di autorizzazione. Porta con sé lo stato HTTP da restituire, così i
 * Route Handler non devono indovinarlo.
 */
export class UnauthorizedError extends Error {
  readonly status: number

  constructor(message: string, status = 401) {
    super(message)
    this.name = 'UnauthorizedError'
    this.status = status
  }
}

export function isUnauthorizedError(error: unknown): error is UnauthorizedError {
  return error instanceof UnauthorizedError
}

const encoder = new TextEncoder()

function constantTimeEquals(received: string, expected: string): boolean {
  const left = encoder.encode(received)
  const right = encoder.encode(expected)

  if (left.length !== right.length) {
    // Confronto fittizio di pari costo: serve a non far trapelare la lunghezza
    // del segreto dalla differenza di tempo fra i due rami.
    timingSafeEqual(left, left)
    return false
  }

  return timingSafeEqual(left, right)
}

/** Estrae il token da un header `Authorization: Bearer <token>`. */
function readBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header) return null

  const [scheme, ...rest] = header.split(' ')
  if (scheme?.toLowerCase() !== 'bearer') return null

  const token = rest.join(' ').trim()
  return token.length > 0 ? token : null
}

function assertSecret(received: string | null, expected: string, what: string): void {
  if (expected.length === 0) {
    // Può succedere solo con SKIP_ENV_VALIDATION: rifiutare tutto è l'unico
    // comportamento accettabile, meglio un endpoint muto che uno aperto.
    throw new UnauthorizedError(`${what} non configurato sul server`, 500)
  }

  if (received === null || !constantTimeEquals(received, expected)) {
    throw new UnauthorizedError(`${what} mancante o non valido`, 401)
  }
}

/**
 * Verifica che una richiesta provenga da un altro pezzo di VOCE.
 *
 * Accetta l'header `x-internal-key` (usato dal fan-out asincrono dei webhook)
 * oppure `Authorization: Bearer <INTERNAL_KEY>`.
 *
 * @throws UnauthorizedError se la chiave manca o non corrisponde
 */
export function assertInternalKey(req: Request): void {
  const headerKey = req.headers.get(INTERNAL_KEY_HEADER)
  const received = headerKey ?? readBearerToken(req)
  assertSecret(received, serverEnv.INTERNAL_KEY, 'INTERNAL_KEY')
}

/**
 * Verifica che una richiesta arrivi dallo scheduler di Vercel.
 *
 * Vercel aggiunge da sé `Authorization: Bearer $CRON_SECRET` alle invocazioni
 * dei cron quando la variabile `CRON_SECRET` è impostata sul progetto. Le
 * stesse rotte restano richiamabili a mano con lo stesso header — cosa
 * necessaria sul piano Hobby, dove i cron sotto il giorno non sono ammessi.
 *
 * @throws UnauthorizedError se il segreto manca o non corrisponde
 */
export function assertCronSecret(req: Request): void {
  assertSecret(readBearerToken(req), serverEnv.CRON_SECRET, 'CRON_SECRET')
}

/**
 * Header da usare quando si chiama un endpoint interno di VOCE, così la chiave
 * non viene letta da `process.env` sparso nel codice.
 *
 * ```ts
 * await fetch(`${serverEnv.APP_URL}/api/internal/triage`, {
 *   method: 'POST',
 *   headers: internalRequestHeaders(),
 *   body: JSON.stringify({ reportId }),
 * })
 * ```
 */
export function internalRequestHeaders(): Record<string, string> {
  return {
    'content-type': 'application/json',
    [INTERNAL_KEY_HEADER]: serverEnv.INTERNAL_KEY,
  }
}
