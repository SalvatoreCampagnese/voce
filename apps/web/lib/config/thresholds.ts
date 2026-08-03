/**
 * Soglie operative effettive, lato server.
 *
 * Rapporto con gli altri due file di configurazione:
 *
 *   constants.ts  → i valori PREDEFINITI, tarati su dati veri. File puro,
 *                   importabile anche da un Client Component.
 *   env.ts        → legge e valida le eventuali variabili d'ambiente.
 *   thresholds.ts → questo file: i valori EFFETTIVI a runtime, più i controlli
 *                   di coerenza fra soglie che, prese singolarmente, sarebbero
 *                   tutte valide ma insieme non avrebbero senso.
 *
 * Il codice server importa SEMPRE da qui, mai da constants.ts: altrimenti una
 * variabile d'ambiente impostata su Vercel verrebbe ignorata in silenzio, che è
 * il modo peggiore di scoprire di aver tarato male un pilot.
 */

import { serverEnv } from '@/lib/config/env'
import { CRON_MAX_DURATION_SECONDS, THRESHOLDS_LAST_TUNED } from '@/lib/config/constants'

export interface Soglie {
  /** Similarità minima per unire una segnalazione a un gruppo esistente. */
  similarityAssign: number
  /** Similarità minima per formare un gruppo nuovo. */
  similarityNew: number
  /** Segnalazioni simili necessarie a creare un gruppo. */
  minReportsNewCluster: number
  /** Cittadini distinti prima che un gruppo sia pubblico. Soglia di privacy. */
  minPublicCitizens: number
  /** Cittadini distinti che fanno scattare la generazione degli atti. */
  actionThresholdCitizens: number
  /** Segnalazioni per cittadino, per canale, nella finestra. */
  rateLimitReportsPerHour: number
  /** Ampiezza della finestra del rate limit, in minuti. */
  rateLimitWindowMinutes: number
  /** Raggio di arrotondamento delle coordinate pubbliche, in metri. */
  geoBlurMeters: number
  /** Righe elaborate da un cron per lotto. */
  cronBatchSize: number
  /** Tempo che un cron può consumare prima di fermarsi da solo. */
  cronTimeBudgetMs: number
  /** Data dell'ultima taratura dei valori predefiniti. */
  lastTuned: string
}

/**
 * Coerenza fra soglie.
 *
 * Ogni valore passa già la validazione di env.ts preso da solo. Qui si
 * controllano le relazioni: sono queste a rompersi quando qualcuno cambia un
 * numero su Vercel alle undici di sera senza rileggere il resto.
 *
 * Distinzione voluta fra errori e avvisi: si blocca l'avvio solo quando la
 * combinazione produce un danno (esporre persone, non creare mai un gruppo);
 * si logga soltanto quando la scelta è insolita ma legittima.
 */
export function verificaCoerenza(s: Soglie): { errori: string[]; avvisi: string[] } {
  const errori: string[] = []
  const avvisi: string[] = []

  if (s.similarityNew < s.similarityAssign) {
    errori.push(
      `SIMILARITY_NEW (${s.similarityNew}) è sotto SIMILARITY_ASSIGN (${s.similarityAssign}): ` +
        'creare un gruppo nuovo diventerebbe più facile che entrare in uno esistente, ' +
        'e nascerebbero gruppi doppioni sullo stesso problema.',
    )
  }

  if (s.minPublicCitizens < 2) {
    errori.push(
      `MIN_PUBLIC_CITIZENS (${s.minPublicCitizens}) è sotto 2: un gruppo pubblico ` +
        'coinciderebbe con una singola persona, che verrebbe così identificata.',
    )
  }

  if (s.cronTimeBudgetMs >= CRON_MAX_DURATION_SECONDS * 1000) {
    errori.push(
      `CRON_TIME_BUDGET_MS (${s.cronTimeBudgetMs}) non lascia margine sotto il limite ` +
        `di ${CRON_MAX_DURATION_SECONDS}s: il job verrebbe troncato dalla piattaforma ` +
        'senza scrivere il log di esito, e nessuno saprebbe se è girato.',
    )
  }

  if (s.actionThresholdCitizens < s.minPublicCitizens) {
    avvisi.push(
      `ACTION_THRESHOLD_CITIZENS (${s.actionThresholdCitizens}) è sotto ` +
        `MIN_PUBLIC_CITIZENS (${s.minPublicCitizens}): si genererebbero atti per gruppi ` +
        'che i cittadini non possono ancora vedere.',
    )
  }

  if (s.minReportsNewCluster < s.minPublicCitizens) {
    avvisi.push(
      `MIN_REPORTS_NEW_CLUSTER (${s.minReportsNewCluster}) è sotto MIN_PUBLIC_CITIZENS ` +
        `(${s.minPublicCitizens}): nessun gruppo potrà mai diventare pubblico appena creato.`,
    )
  }

  if (s.geoBlurMeters < 100) {
    avvisi.push(
      `GEO_BLUR_METERS (${s.geoBlurMeters}) è basso: in un centro storico un raggio ` +
        'così stretto può ancora individuare l\'isolato di chi ha segnalato.',
    )
  }

  return { errori, avvisi }
}

let cache: Soglie | null = null

/** Soglie effettive. Validate e memorizzate alla prima lettura. */
export function getSoglie(): Soglie {
  if (cache) return cache

  const s: Soglie = {
    similarityAssign: serverEnv.SIMILARITY_ASSIGN,
    similarityNew: serverEnv.SIMILARITY_NEW,
    minReportsNewCluster: serverEnv.MIN_REPORTS_NEW_CLUSTER,
    minPublicCitizens: serverEnv.MIN_PUBLIC_CITIZENS,
    actionThresholdCitizens: serverEnv.ACTION_THRESHOLD_CITIZENS,
    rateLimitReportsPerHour: serverEnv.RATE_LIMIT_REPORTS_PER_HOUR,
    rateLimitWindowMinutes: serverEnv.RATE_LIMIT_WINDOW_MINUTES,
    geoBlurMeters: serverEnv.GEO_BLUR_METERS,
    cronBatchSize: serverEnv.CRON_BATCH_SIZE,
    cronTimeBudgetMs: serverEnv.CRON_TIME_BUDGET_MS,
    lastTuned: THRESHOLDS_LAST_TUNED,
  }

  const { errori, avvisi } = verificaCoerenza(s)

  if (avvisi.length > 0) {
    console.warn(`[soglie] configurazione insolita:\n  · ${avvisi.join('\n  · ')}`)
  }

  if (errori.length > 0) {
    throw new Error(
      `Soglie incoerenti fra loro:\n  · ${errori.join('\n  · ')}\n\n` +
        'Correggi le variabili d\'ambiente. I valori predefiniti sono in ' +
        'apps/web/lib/config/constants.ts.',
    )
  }

  cache = s
  return cache
}
