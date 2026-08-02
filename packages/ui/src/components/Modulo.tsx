import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

/**
 * Campo di modulo: etichetta VISIBILE sopra, aiuto sotto, errore in fondo.
 *
 * Il placeholder non è un'etichetta: sparisce appena si scrive e molti screen
 * reader non lo annunciano. Qui `etichetta` è obbligatoria per costruzione.
 *
 * L'aiuto e l'errore sono collegati al campo con aria-describedby, così chi usa
 * uno screen reader li sente quando entra nel campo, non dopo aver sbagliato.
 */
export function CampoModulo({
  id,
  etichetta,
  aiuto,
  errore,
  obbligatorio,
  children,
  className,
}: {
  id: string
  etichetta: string
  aiuto?: string
  errore?: string
  obbligatorio?: boolean
  /** Riceve gli attributi da applicare al controllo. */
  children: (attributi: {
    id: string
    'aria-describedby'?: string
    'aria-invalid'?: boolean
    'aria-required'?: boolean
    className: string
  }) => ReactNode
  className?: string
}) {
  const idAiuto = aiuto ? `${id}-aiuto` : undefined
  const idErrore = errore ? `${id}-errore` : undefined
  const describedBy = [idAiuto, idErrore].filter(Boolean).join(' ') || undefined

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-body font-semibold text-ink">
        {etichetta}
        {obbligatorio && (
          <span className="ml-1 text-danger" aria-hidden="true">
            *
          </span>
        )}
        {obbligatorio && <span className="sr-only"> (obbligatorio)</span>}
      </label>

      {aiuto && (
        <p id={idAiuto} className="text-small text-ink-muted">
          {aiuto}
        </p>
      )}

      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': errore ? true : undefined,
        'aria-required': obbligatorio || undefined,
        className: cn(
          'w-full min-h-11 rounded border bg-white px-3 py-2 text-body text-ink',
          'placeholder:text-ink-subtle',
          errore ? 'border-danger border-2' : 'border-border-control',
        ),
      })}

      {errore && (
        <p id={idErrore} className="text-small font-semibold text-danger">
          {errore}
        </p>
      )}
    </div>
  )
}
