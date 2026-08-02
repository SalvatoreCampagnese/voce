import { cn } from '../lib/cn'

/**
 * Percorso di navigazione, obbligatorio in ogni pagina interna secondo le
 * linee guida di design dei servizi pubblici.
 *
 * L'ultima voce è la pagina corrente: non è un link e porta aria-current.
 */
export interface VoceBreadcrumb {
  etichetta: string
  href?: string
}

export function Breadcrumb({
  voci,
  className,
}: {
  voci: VoceBreadcrumb[]
  className?: string
}) {
  return (
    <nav aria-label="Percorso di navigazione" className={cn('mb-6', className)}>
      <ol className="flex flex-wrap items-center gap-2 text-small text-ink-muted">
        {voci.map((voce, i) => {
          const ultima = i === voci.length - 1
          return (
            <li key={`${voce.etichetta}-${i}`} className="flex items-center gap-2">
              {ultima || !voce.href ? (
                <span aria-current={ultima ? 'page' : undefined} className="font-semibold text-ink">
                  {voce.etichetta}
                </span>
              ) : (
                <a href={voce.href} className="underline underline-offset-2 hover:text-primary-600">
                  {voce.etichetta}
                </a>
              )}
              {!ultima && (
                <span aria-hidden="true" className="text-ink-subtle">
                  /
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
