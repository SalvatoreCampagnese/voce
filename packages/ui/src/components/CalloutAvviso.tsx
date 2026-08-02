import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

/**
 * Box di avviso.
 *
 * Ogni variante porta icona + parola ("Attenzione", "Errore"): il colore da
 * solo non basta (WCAG 1.4.1). L'icona è decorativa e nascosta agli screen
 * reader, che leggono l'etichetta testuale.
 */
type Tono = 'info' | 'attenzione' | 'errore' | 'successo'

const TONI: Record<Tono, { box: string; etichetta: string; icona: ReactNode }> = {
  info: {
    box: 'border-info bg-info-bg',
    etichetta: 'Informazione',
    icona: (
      <path d="M12 8h.01M11 12h1v4h1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    ),
  },
  attenzione: {
    box: 'border-warning bg-warning-bg',
    etichetta: 'Attenzione',
    icona: <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />,
  },
  errore: {
    box: 'border-danger bg-danger-bg',
    etichetta: 'Errore',
    icona: <path d="M12 8v5m0 3h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  },
  successo: {
    box: 'border-success bg-success-bg',
    etichetta: 'Fatto',
    icona: <path d="m8 12.5 3 3 5-6M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  },
}

export function CalloutAvviso({
  tono = 'info',
  titolo,
  children,
  className,
}: {
  tono?: Tono
  titolo?: string
  children: ReactNode
  className?: string
}) {
  const t = TONI[tono]
  return (
    <div
      className={cn('flex gap-3 rounded border-l-4 p-4', t.box, className)}
      role={tono === 'errore' ? 'alert' : undefined}
    >
      <svg
        className="mt-0.5 h-5 w-5 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {t.icona}
      </svg>
      <div className="text-small">
        <p className="font-semibold text-ink">{titolo ?? t.etichetta}</p>
        <div className="mt-1 text-ink-muted">{children}</div>
      </div>
    </div>
  )
}
