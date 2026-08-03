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

// --- Inserimenti ------------------------------------------------------------
export type CitizenInsert = Tables['citizens']['Insert']
export type ReportInsert = Tables['reports']['Insert']
export type ClusterInsert = Tables['clusters']['Insert']
export type ActionInsert = Tables['actions']['Insert']
export type SignatureInsert = Tables['signatures']['Insert']

// --- Viste pubbliche --------------------------------------------------------
// Sono l'unica superficie leggibile senza sessione: espongono anon_text,
// coordinate arrotondate e date troncate. Le pagine pubbliche leggono SEMPRE
// da qui, mai dalle tabelle.
export type PublicCluster = Views['public_clusters']['Row']
export type PublicClusterReport = Views['public_cluster_reports']['Row']
export type PublicAction = Views['public_actions']['Row']
export type PublicCityStats = Views['public_city_stats']['Row']
export type PublicPlatformStats = Views['public_platform_stats']['Row']

// --- Enum -------------------------------------------------------------------
export type ReportChannel = Enums['report_channel']
export type ReportStatus = Enums['report_status']
export type ClusterStatus = Enums['cluster_status']
export type ActionKind = Enums['action_kind']
export type ActionStatus = Enums['action_status']

/** Etichette in italiano per l'interfaccia. Il database resta in inglese. */
export const ACTION_KIND_LABELS: Record<ActionKind, string> = {
  esposto_procura: 'Esposto in Procura',
  accesso_civico: 'Accesso civico',
  segnalazione_difensore_civico: 'Segnalazione al difensore civico',
  mozione_consigliere: 'Mozione in consiglio comunale',
  dossier_giornalistico: 'Dossier per la stampa',
  diffida_pa: 'Diffida alla pubblica amministrazione',
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
