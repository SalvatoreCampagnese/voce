import { cn } from '../lib/cn'

/**
 * Avanzamento della raccolta firme.
 *
 * Il numero è scritto in chiaro accanto alla barra: una barra colorata da sola
 * non dice niente a chi non la vede, e poco a chi la vede di sfuggita.
 */
export function BarraProgresso({
  valore,
  obiettivo,
  etichetta = 'firme raccolte',
  className,
}: {
  valore: number
  obiettivo: number
  etichetta?: string
  className?: string
}) {
  const sicuroObiettivo = Math.max(obiettivo, 1)
  const percentuale = Math.min(100, Math.round((valore / sicuroObiettivo) * 100))

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <p className="text-body">
        <span className="text-h4 font-bold text-ink">{valore}</span>
        <span className="text-ink-muted">
          {' '}
          / {obiettivo} {etichetta}
        </span>
      </p>
      <div
        className="h-3 w-full overflow-hidden rounded-pill bg-surface-strong"
        role="progressbar"
        aria-valuenow={valore}
        aria-valuemin={0}
        aria-valuemax={obiettivo}
        aria-label={`${valore} di ${obiettivo} ${etichetta}`}
      >
        <div
          className="h-full rounded-pill bg-primary-500 transition-[width]"
          style={{ width: `${percentuale}%` }}
        />
      </div>
    </div>
  )
}
