import { cn } from '../lib/cn'

/** Statistica in evidenza: numero grande, etichetta sotto. */
export function Numero({
  valore,
  etichetta,
  className,
}: {
  valore: number | string
  etichetta: string
  className?: string
}) {
  return (
    <div className={cn('flex flex-col', className)}>
      <span className="text-h1 font-bold text-primary-700">
        {typeof valore === 'number' ? valore.toLocaleString('it-IT') : valore}
      </span>
      <span className="text-small text-ink-muted">{etichetta}</span>
    </div>
  )
}
