import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

/**
 * Contenitore bianco con bordo sottile: l'unità di base delle pagine.
 * `as` permette di usarla come <article> o <li> senza perdere la semantica.
 */
export function CardIstituzionale({
  children,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode
  className?: string
  as?: 'div' | 'article' | 'li' | 'section'
}) {
  return (
    <Tag
      className={cn(
        'rounded-card border border-surface-strong bg-white p-6 shadow-card',
        className,
      )}
    >
      {children}
    </Tag>
  )
}
