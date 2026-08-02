import { cn } from '../lib/cn'

/**
 * Pill di stato.
 *
 * Il colore NON è mai l'unico veicolo dell'informazione (WCAG 1.4.1): ogni tag
 * porta sempre la sua etichetta testuale. Chi non distingue i colori legge
 * comunque "In azione".
 */
const STILI = {
  nuovo: 'bg-info-bg text-ink-muted',
  emergente: 'bg-info-bg text-ink-muted',
  attivo: 'bg-primary-50 text-primary-700',
  in_azione: 'bg-warning-bg text-warning',
  risolto: 'bg-success-bg text-success',
  ignorato: 'bg-danger-bg text-danger',
  bozza: 'bg-info-bg text-ink-muted',
  in_firma: 'bg-primary-50 text-primary-700',
  inviata: 'bg-warning-bg text-warning',
  risposta_ricevuta: 'bg-success-bg text-success',
  archiviata: 'bg-surface-alt text-ink-muted',
} as const

const ETICHETTE: Record<keyof typeof STILI, string> = {
  nuovo: 'Nuova',
  emergente: 'Emergente',
  attivo: 'Attivo',
  in_azione: 'In azione',
  risolto: 'Risolto',
  ignorato: 'Senza risposta',
  bozza: 'Bozza',
  in_firma: 'Raccolta firme',
  inviata: 'Inviata',
  risposta_ricevuta: 'Risposta ricevuta',
  archiviata: 'Archiviata',
}

export type StatoTag = keyof typeof STILI

export function TagStato({ stato, className }: { stato: StatoTag; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill px-3 py-1 text-caption font-semibold',
        STILI[stato],
        className,
      )}
    >
      {ETICHETTE[stato]}
    </span>
  )
}
