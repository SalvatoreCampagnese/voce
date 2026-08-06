import type { ReactNode } from 'react'
import { cn } from '@voce/ui'

/**
 * Tabella accessibile del pannello.
 *
 * Tre cose che una `<table>` scritta di fretta non ha, e che qui sono per
 * costruzione:
 *
 * 1. `<caption>` visibile: chi arriva sulla tabella con uno screen reader sente
 *    di cosa parla prima di sentire le celle;
 * 2. `<th scope="col">` su ogni intestazione: senza `scope`, le celle non sono
 *    associate a nulla e la tabella diventa un elenco di numeri senza nome;
 * 3. il contenitore che scorre è raggiungibile da tastiera (`tabIndex` e
 *    `role="region"`): su un telefono la tabella scorre in orizzontale, e senza
 *    questo chi naviga da tastiera non può farla scorrere.
 */
export function TabellaAdmin({
  didascalia,
  colonne,
  children,
  className,
}: {
  didascalia: string
  colonne: string[]
  /** Le `<tr>` del corpo. */
  children: ReactNode
  className?: string
}) {
  return (
    <div
      role="region"
      aria-label={didascalia}
      tabIndex={0}
      className={cn(
        'overflow-x-auto rounded-card border border-surface-strong bg-white',
        className,
      )}
    >
      <table className="w-full border-collapse text-left text-small">
        <caption className="px-4 pt-4 pb-2 text-left text-small text-ink-muted">
          {didascalia}
        </caption>
        <thead>
          <tr className="border-b border-surface-strong bg-surface-alt">
            {colonne.map((colonna) => (
              <th
                key={colonna}
                scope="col"
                className="px-4 py-3 text-small font-semibold text-ink whitespace-nowrap"
              >
                {colonna}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

/** Cella del corpo, con la stessa spaziatura delle intestazioni. */
export function CellaAdmin({
  children,
  className,
  intestazione,
}: {
  children: ReactNode
  className?: string
  /** Se vero, diventa `<th scope="row">`: la prima colonna nomina la riga. */
  intestazione?: boolean
}) {
  const classi = cn('border-b border-surface-strong px-4 py-3 align-top', className)

  if (intestazione) {
    return (
      <th scope="row" className={cn(classi, 'font-semibold text-ink')}>
        {children}
      </th>
    )
  }

  return <td className={classi}>{children}</td>
}
