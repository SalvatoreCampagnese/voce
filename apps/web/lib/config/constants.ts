/**
 * Soglie operative di VOCE — contratto di build §5.
 *
 * Questa è l'unica fonte di verità: nessun numero magico sparso nelle route,
 * nei prompt o nelle query SQL. Chi cambia una soglia cambia questo file e
 * aggiorna `THRESHOLDS_LAST_TUNED`.
 *
 * Il file è puro: nessun import, nessun accesso a `process.env`. Può quindi
 * essere importato anche da un Client Component senza trascinare segreti nel
 * bundle del browser.
 */

/**
 * Data dell'ultima taratura delle soglie qui sotto.
 * I valori sono calibrati per un pilot su **un solo quartiere** con poche
 * centinaia di segnalazioni: su scala nazionale vanno rivisti con dati veri.
 */
export const THRESHOLDS_LAST_TUNED = '2026-08-02'

// ---------------------------------------------------------------------------
// Similarità e clustering
// ---------------------------------------------------------------------------

/**
 * Similarità coseno minima per assegnare una nuova segnalazione a un gruppo
 * che esiste già.
 *
 * TARATA SU DATI VERI (2026-08-02, `text-embedding-3-small`, 7 segnalazioni in
 * italiano colloquiale su due temi). Misura delle coppie:
 *
 *   stesso tema (attese al pronto soccorso):  min 0.614 · media 0.692 · max 0.791
 *   temi diversi (sanità contro mobilità):    min 0.323 · media 0.362 · max 0.418
 *
 * Fra 0.418 e 0.614 non cade nessuna coppia: la soglia si mette in quel vuoto.
 *
 * PLAN.md §5.2 proponeva 0.82 e §5.3 proponeva 0.84. Sono valori presi da
 * intuizione, non da misura: con quelli NESSUN gruppo si sarebbe mai formato,
 * perché nemmeno due racconti dello stesso identico disservizio arrivano a 0.8.
 * Era il tipo di errore che in demo si manifesta come «il prodotto non fa niente».
 *
 * Il filtro su categoria e zona resta il vincolo duro: la similarità è il
 * secondo setaccio, non il primo.
 */
export const SIMILARITY_ASSIGN = 0.55

/**
 * Similarità minima per considerare due segnalazioni orfane candidate a formare
 * un gruppo **nuovo**. Più alta di `SIMILARITY_ASSIGN` di proposito: creare un
 * gruppo sbagliato costa più che lasciare una segnalazione fuori per un giro.
 *
 * Resta sotto il minimo osservato fra segnalazioni dello stesso tema (0.614) e
 * molto sopra il massimo fra temi diversi (0.418).
 *
 * Da ritarare sul quartiere pilota appena ci sono qualche centinaio di
 * segnalazioni vere: sette messaggi sono una misura, non una statistica.
 */
export const SIMILARITY_NEW = 0.6

/**
 * Quante segnalazioni orfane e simili servono prima di creare un gruppo nuovo.
 * Sotto questo numero non c'è un problema collettivo: c'è una persona.
 */
export const MIN_REPORTS_NEW_CLUSTER = 5

/**
 * Cittadini **distinti** che devono comparire in un gruppo prima che il gruppo
 * diventi visibile pubblicamente.
 * Non è una soglia di prodotto ma di privacy: un gruppo con una sola
 * segnalazione in una via corta identifica chi l'ha scritta.
 */
export const MIN_PUBLIC_CITIZENS = 3

/**
 * Cittadini **distinti** in un gruppo che fanno scattare la generazione degli
 * atti. Il contratto §5 fissa 5, non i 30 di `PLAN.md` §5.2: con 30 nessun
 * dossier verrebbe mai generato durante la demo.
 * A runtime il valore effettivo è `serverEnv.ACTION_THRESHOLD_CITIZENS`, che
 * usa questo numero come default e può essere sovrascritto da variabile
 * d'ambiente senza ricompilare.
 */
export const ACTION_THRESHOLD_CITIZENS = 5

// ---------------------------------------------------------------------------
// Abuso e rate limiting
// ---------------------------------------------------------------------------

/**
 * Segnalazioni accettate da un singolo cittadino, per canale, in un'ora.
 * Serve contro il flooding, non contro il cittadino insistente: chi supera la
 * soglia riceve una risposta cortese e riprova dopo `retryAfterSeconds`.
 */
export const RATE_LIMIT_REPORTS_PER_HOUR = 5

/**
 * Ampiezza della finestra scorrevole usata dal rate limit, in minuti.
 * Cambiare questo valore senza cambiare `RATE_LIMIT_REPORTS_PER_HOUR` cambia
 * di fatto la soglia: sono una coppia.
 */
export const RATE_LIMIT_WINDOW_MINUTES = 60

// ---------------------------------------------------------------------------
// Geografia e privacy
// ---------------------------------------------------------------------------

/**
 * Raggio di arrotondamento delle coordinate mostrate al pubblico, in metri.
 * Il database conserva la posizione esatta; ogni output pubblico passa da
 * `blurCoordinates()` lato applicazione o da `blur_point(location, 300)` lato
 * SQL. I due devono restare allineati su questo numero.
 */
export const GEO_BLUR_METERS = 300

// ---------------------------------------------------------------------------
// Job schedulati
// ---------------------------------------------------------------------------

/**
 * Durata massima concessa a una funzione di cron, in secondi.
 * Next.js richiede che `maxDuration` in un Route Handler sia un letterale
 * statico, quindi nelle route va scritto a mano (`export const maxDuration = 60`):
 * questa costante esiste per documentare il budget e per calcolare
 * `CRON_TIME_BUDGET_MS`.
 */
export const CRON_MAX_DURATION_SECONDS = 60

/**
 * Tempo che un cron può consumare prima di fermarsi da solo e lasciare il
 * resto al giro successivo. Sta sotto `CRON_MAX_DURATION_SECONDS` con dieci
 * secondi di margine: un job interrotto dalla piattaforma non scrive il log
 * di esito, e un job senza log di esito è un job che nessuno sa se è girato.
 */
export const CRON_TIME_BUDGET_MS = 50_000

/**
 * Quante righe elabora un cron per lotto. Lotti piccoli rendono il lavoro
 * interrompibile: se il budget scade a metà, quello già fatto è salvo.
 */
export const CRON_BATCH_SIZE = 25

/**
 * Dopo quanti fallimenti consecutivi un job va considerato rotto e segnalato
 * con un log di livello `error` (che su Vercel si può agganciare a un alert).
 */
export const CRON_FAILURE_ALERT_THRESHOLD = 3

// ---------------------------------------------------------------------------
// Canali di ingestione
// ---------------------------------------------------------------------------

/**
 * Canali da cui può arrivare una segnalazione. Rispecchia l'enum SQL
 * `report_channel`: se cambia lo schema, cambia anche questa lista.
 */
export const REPORT_CHANNELS = ['whatsapp', 'telegram', 'web', 'voice'] as const

export type ReportChannel = (typeof REPORT_CHANNELS)[number]
