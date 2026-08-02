/**
 * Arrotondamento delle coordinate per l'esposizione pubblica.
 *
 * Il database conserva la posizione esatta (`reports.location`). Tutto ciò che
 * esce verso una pagina pubblica, una mappa o un'API aperta passa da qui o
 * dalla funzione SQL equivalente `blur_point(location, 300)`.
 *
 * La sfumatura è **deterministica**: la stessa coordinata produce sempre lo
 * stesso punto arrotondato. Un rumore casuale sarebbe più elegante ma
 * peggiore: chi interroga più volte la stessa segnalazione ne farebbe la media
 * e ricostruirebbe la posizione vera.
 *
 * Modulo puro: nessun accesso a rete, database o variabili d'ambiente.
 */

import { GEO_BLUR_METERS } from '@/lib/config/constants'

/**
 * Metri per grado di latitudine. Costante a tutte le latitudini (la Terra è
 * approssimata a una sfera: l'errore è sotto lo 0,3%, irrilevante rispetto a
 * una griglia da 300 m).
 */
const METERS_PER_DEGREE_LATITUDE = 111_320

/** Sotto questo coseno siamo ai poli e la conversione in longitudine esplode. */
const MIN_LATITUDE_COSINE = 1e-6

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

function assertFiniteNumber(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} deve essere un numero finito, ricevuto: ${String(value)}`)
  }
}

/**
 * Converte una distanza in metri nell'equivalente in gradi di latitudine.
 */
export function metersToLatitudeDegrees(meters: number): number {
  assertFiniteNumber(meters, 'meters')
  return meters / METERS_PER_DEGREE_LATITUDE
}

/**
 * Converte una distanza in metri nell'equivalente in gradi di longitudine
 * **alla latitudine data**: un grado di longitudine vale ~111 km all'equatore
 * e ~78 km a Milano, quindi la conversione dipende dalla latitudine.
 */
export function metersToLongitudeDegrees(meters: number, latitude: number): number {
  assertFiniteNumber(meters, 'meters')
  assertFiniteNumber(latitude, 'latitude')

  const cosine = Math.abs(Math.cos(toRadians(latitude)))
  if (cosine < MIN_LATITUDE_COSINE) {
    // Ai poli tutte le longitudini coincidono: qualunque valore è arbitrario.
    return 360
  }
  return meters / (METERS_PER_DEGREE_LATITUDE * cosine)
}

function roundToStep(value: number, step: number): number {
  if (step <= 0) return value
  return Math.round(value / step) * step
}

/** Evita code di rumore in virgola mobile tipo 45.30000000000001. */
function trim(value: number): number {
  return Number.parseFloat(value.toFixed(6))
}

/**
 * Arrotonda una coppia di coordinate a una griglia di lato `meters`.
 *
 * @param lat latitudine in gradi, fra -90 e 90
 * @param lng longitudine in gradi, fra -180 e 180
 * @param meters lato della griglia; default `GEO_BLUR_METERS` (300 m)
 * @returns il centro della cella di griglia che contiene il punto
 */
export function blurCoordinates(
  lat: number,
  lng: number,
  meters: number = GEO_BLUR_METERS,
): { lat: number; lng: number } {
  assertFiniteNumber(lat, 'lat')
  assertFiniteNumber(lng, 'lng')
  assertFiniteNumber(meters, 'meters')

  if (lat < -90 || lat > 90) {
    throw new RangeError(`Latitudine fuori intervallo: ${lat}`)
  }
  if (lng < -180 || lng > 180) {
    throw new RangeError(`Longitudine fuori intervallo: ${lng}`)
  }
  if (meters <= 0) {
    throw new RangeError(`Il raggio di sfumatura deve essere positivo, ricevuto: ${meters}`)
  }

  const latitudeStep = metersToLatitudeDegrees(meters)
  const blurredLat = Math.min(90, Math.max(-90, roundToStep(lat, latitudeStep)))

  // Il passo in longitudine si calcola sulla latitudine già arrotondata, così
  // due punti nella stessa cella producono esattamente lo stesso risultato.
  const longitudeStep = metersToLongitudeDegrees(meters, blurredLat)
  let blurredLng = roundToStep(lng, longitudeStep)

  // Normalizza l'antimeridiano: 180.02 → -179.98
  if (blurredLng > 180) blurredLng -= 360
  if (blurredLng < -180) blurredLng += 360

  return { lat: trim(blurredLat), lng: trim(blurredLng) }
}
