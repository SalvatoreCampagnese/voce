import { cn } from '../lib/cn'

/**
 * Banda tricolore da 4px in cima alle pagine pubbliche.
 *
 * È decorativa: aria-hidden, così gli screen reader non annunciano tre div
 * vuoti prima di ogni pagina.
 */
export function Tricolore({ className }: { className?: string }) {
  return (
    <div className={cn('flex h-1 w-full', className)} aria-hidden="true">
      <div className="flex-1 bg-tricolore-verde" />
      <div className="flex-1 bg-white" />
      <div className="flex-1 bg-tricolore-rosso" />
    </div>
  )
}
