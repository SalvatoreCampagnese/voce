import type { ReactNode } from 'react'
import { CardIstituzionale } from '@voce/ui'

/**
 * Coda vuota.
 *
 * Uno zero da solo non dice se il lavoro è finito o se la pagina è rotta. Qui
 * si scrive una frase: chi apre il pannello alle sette di sera deve poter
 * chiudere il portatile sapendo che non c'era niente da fare.
 */
export function RiquadroVuoto({
  titolo,
  children,
}: {
  titolo: string
  children?: ReactNode
}) {
  return (
    <CardIstituzionale>
      <h2 className="text-h4">{titolo}</h2>
      {children && <div className="mt-2 text-body text-ink-muted">{children}</div>}
    </CardIstituzionale>
  )
}
