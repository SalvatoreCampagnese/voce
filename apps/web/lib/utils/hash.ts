/**
 * Pseudonimizzazione degli indirizzi IP.
 *
 * VOCE registra l'IP di chi firma un atto per poter dimostrare che le firme
 * non arrivano tutte dalla stessa macchina. L'IP in chiaro è un dato personale
 * e non serve a nulla: serve solo poter dire «queste due firme vengono dalla
 * stessa origine». Un digest SHA-256 con un salt segreto dà esattamente questo.
 *
 * Il salt (`IP_HASH_SALT`) è ciò che rende il digest non invertibile in
 * pratica: senza salt lo spazio degli IPv4 è di 4 miliardi di valori e si
 * enumera in pochi minuti.
 *
 * **Solo server**: legge un segreto da `serverEnv`.
 */

import { serverEnv } from '@/lib/config/env'

const UNKNOWN_IP = 'sconosciuto'

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Normalizza un valore che può arrivare da `x-forwarded-for`: la catena dei
 * proxy è una lista separata da virgole e il primo elemento è il client.
 */
export function normalizeIp(ip: string): string {
  const first = ip.split(',')[0] ?? ''
  const trimmed = first.trim().toLowerCase()
  if (trimmed.length === 0) return UNKNOWN_IP
  // IPv4 mappato su IPv6: ::ffff:93.45.1.2 → 93.45.1.2
  return trimmed.startsWith('::ffff:') ? trimmed.slice('::ffff:'.length) : trimmed
}

/**
 * Estrae l'IP del client da una richiesta.
 *
 * Dietro Vercel l'header affidabile è `x-forwarded-for`, riscritto dalla
 * piattaforma: il valore inviato dal client viene sostituito, quindi non è
 * falsificabile dall'esterno. `x-real-ip` è il fallback per l'esecuzione
 * locale dietro un tunnel.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return normalizeIp(forwarded)

  const realIp = request.headers.get('x-real-ip')
  if (realIp) return normalizeIp(realIp)

  return UNKNOWN_IP
}

/**
 * Restituisce l'impronta SHA-256 (esadecimale, 64 caratteri) di un IP,
 * salata con `IP_HASH_SALT`.
 *
 * Un IP vuoto o assente produce comunque un'impronta stabile: la colonna
 * `signatures.ip_hash` non resta mai nulla per un errore di lettura header.
 */
export async function hashIp(ip: string): Promise<string> {
  const normalized = normalizeIp(ip)
  const payload = new TextEncoder().encode(`${serverEnv.IP_HASH_SALT}:${normalized}`)
  const digest = await crypto.subtle.digest('SHA-256', payload)
  return toHex(digest)
}
