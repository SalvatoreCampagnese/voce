/**
 * @voce/db — tipi del database e alias di dominio.
 *
 * `types.ts` è GENERATO: non modificarlo a mano. Dopo ogni migration:
 *   pnpm db:types
 *
 * Qui sopra ci sono solo alias leggibili: nel resto del codice si scrive
 * `Report` invece di `Database['public']['Tables']['reports']['Row']`.
 */
export type { Database, Json } from './types.js'

import type { Database } from './types.js'

type Tables = Database['public']['Tables']
type Views = Database['public']['Views']
type Enums = Database['public']['Enums']

// --- Righe (lettura) --------------------------------------------------------
export type Citizen = Tables['citizens']['Row']
export type Report = Tables['reports']['Row']
export type ReportEmbedding = Tables['report_embeddings']['Row']
export type Cluster = Tables['clusters']['Row']
export type Action = Tables['actions']['Row']
export type Signature = Tables['signatures']['Row']
export type PaEndpoint = Tables['pa_endpoints']['Row']
export type Notification = Tables['notifications']['Row']
export type ReportMedia = Tables['report_media']['Row']
export type ActionResponse = Tables['action_responses']['Row']
export type Admin = Tables['admins']['Row']

// --- Inserimenti ------------------------------------------------------------
export type CitizenInsert = Tables['citizens']['Insert']
export type ReportInsert = Tables['reports']['Insert']
export type ClusterInsert = Tables['clusters']['Insert']
export type ActionInsert = Tables['actions']['Insert']
export type SignatureInsert = Tables['signatures']['Insert']
export type NotificationInsert = Tables['notifications']['Insert']
export type ReportMediaInsert = Tables['report_media']['Insert']
export type ActionResponseInsert = Tables['action_responses']['Insert']

// --- Viste pubbliche --------------------------------------------------------
// Sono l'unica superficie leggibile senza sessione: espongono anon_text,
// coordinate arrotondate e date troncate. Le pagine pubbliche leggono SEMPRE
// da qui, mai dalle tabelle.
export type PublicCluster = Views['public_clusters']['Row']
export type PublicClusterReport = Views['public_cluster_reports']['Row']
export type PublicAction = Views['public_actions']['Row']
export type PublicCityStats = Views['public_city_stats']['Row']
export type PublicPlatformStats = Views['public_platform_stats']['Row']
/** Risposte della PA già confermate da una persona. Mai il testo grezzo. */
export type PublicActionResponse = Views['public_action_responses']['Row']
/** Chi risponde e chi no, con i tempi medi (PLAN2 §6.2). */
export type PublicCityResponsiveness = Views['public_city_responsiveness']['Row']

// --- Viste del pannello di amministrazione ----------------------------------
// Non sono pubbliche: le viste sottostanti hanno un guard `public.is_admin()`
// al loro interno, quindi per chiunque altro restituiscono zero righe.
export type AdminClusterOverview = Views['admin_clusters_overview']['Row']
export type AdminActionQueueItem = Views['admin_actions_queue']['Row']
/**
 * Salute della coda notifiche: tipo, canale, ora, conteggi.
 *
 * Deliberatamente SENZA identificatori. Un elenco delle notifiche riga per riga
 * darebbe a chi amministra la mappa «questo cittadino ha segnalato quel
 * problema», che è esattamente ciò che il resto dello schema evita di rendere
 * leggibile. Per capire se le promesse vengono mantenute bastano i numeri.
 */
export type AdminNotificationHealth = Views['admin_notifications_health']['Row']

// --- Enum -------------------------------------------------------------------
export type ReportChannel = Enums['report_channel']
export type ReportStatus = Enums['report_status']
export type ClusterStatus = Enums['cluster_status']
export type ActionKind = Enums['action_kind']
export type ActionStatus = Enums['action_status']
export type MediaKind = Enums['media_kind']
export type NotificationKind = Enums['notification_kind']
export type NotificationChannel = Enums['notification_channel']
export type PaResponseClass = Enums['pa_response_class']

/** Etichette in italiano per l'interfaccia. Il database resta in inglese. */
export const ACTION_KIND_LABELS: Record<ActionKind, string> = {
  esposto_procura: 'Esposto in Procura',
  accesso_civico: 'Accesso civico',
  segnalazione_difensore_civico: 'Segnalazione al difensore civico',
  mozione_consigliere: 'Mozione in consiglio comunale',
  dossier_giornalistico: 'Dossier per la stampa',
  diffida_pa: 'Diffida alla pubblica amministrazione',
  // I due atti che nascono dallo scadenzario normativo, non dalla generazione
  // iniziale del dossier: si preparano quando un atto già inviato supera il
  // termine di legge senza risposta.
  sollecito: 'Sollecito',
  riesame_accesso_civico: 'Richiesta di riesame',
}

/** A che punto è un atto rispetto al termine di legge. */
export const NOTIFICATION_KIND_LABELS: Record<NotificationKind, string> = {
  gruppo_formato: 'Il gruppo si è formato',
  gruppo_pubblico: 'Il gruppo è diventato pubblico',
  atto_preparato: 'È stata preparata una bozza di atto',
  pa_ha_risposto: 'L’amministrazione ha risposto',
  scadenza_meta: 'Il termine è a metà',
  scadenza_raggiunta: 'Il termine è scaduto',
  scadenza_superata: 'Il termine è scaduto senza risposta',
  // L'esito della moderazione. Esiste perché la quarantena diceva «la leggerà
  // una persona» e poi non diceva mai com'era finita: chi si era visto fermare
  // la segnalazione restava in silenzio per sempre.
  moderazione_riammessa: 'La segnalazione è tornata in circolo',
  moderazione_confermata: 'La segnalazione resta fuori dai gruppi',
}

export const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> = {
  telegram: 'Telegram',
  email: 'Email',
  whatsapp: 'WhatsApp',
}

/**
 * Come è stata classificata una risposta della pubblica amministrazione.
 *
 * Queste etichette compaiono in pagina solo dopo che una persona ha confermato
 * la classificazione: una classificazione sbagliata fa dichiarare pubblicamente
 * che un comune ha ignorato una richiesta a cui invece ha risposto.
 */
export const PA_RESPONSE_CLASS_LABELS: Record<PaResponseClass, string> = {
  accolta: 'Accolta',
  respinta: 'Respinta',
  interlocutoria: 'Interlocutoria',
  irricevibile: 'Irricevibile',
}

export const MEDIA_KIND_LABELS: Record<MediaKind, string> = {
  audio: 'Messaggio vocale',
  foto: 'Fotografia',
}

export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  bozza: 'Bozza',
  in_firma: 'Raccolta firme',
  inviata: 'Inviata',
  risposta_ricevuta: 'Risposta ricevuta',
  archiviata: 'Archiviata',
}

export const CLUSTER_STATUS_LABELS: Record<ClusterStatus, string> = {
  emergente: 'Emergente',
  attivo: 'Attivo',
  in_azione: 'In azione',
  risolto: 'Risolto',
  ignorato: 'Senza risposta',
}

export const CATEGORY_LABELS: Record<string, string> = {
  sanita: 'Sanità',
  mobilita: 'Mobilità',
  ambiente: 'Ambiente',
  sicurezza: 'Sicurezza',
  scuola: 'Scuola',
  servizi_sociali: 'Servizi sociali',
  urbanistica: 'Urbanistica',
  trasparenza: 'Trasparenza',
  altro: 'Altro',
}

export const REPORT_CATEGORIES = Object.keys(CATEGORY_LABELS) as ReportCategory[]
export type ReportCategory =
  | 'sanita'
  | 'mobilita'
  | 'ambiente'
  | 'sicurezza'
  | 'scuola'
  | 'servizi_sociali'
  | 'urbanistica'
  | 'trasparenza'
  | 'altro'
