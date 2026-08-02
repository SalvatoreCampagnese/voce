import type { ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/cn'

/**
 * Varianti del bottone istituzionale.
 *
 * Esportate a parte perché un link non è un bottone: quando l'elemento naviga
 * si usa `<Link className={bottoneVarianti({ variante: 'primary' })}>`, così
 * l'HTML resta semantico (un <a> che sembra un bottone è accessibile, un
 * <button> che naviga no).
 *
 * min-h-11 = 44px: target minimo WCAG 2.5.5 per il tocco.
 */
export const bottoneVarianti = cva(
  'inline-flex min-h-11 items-center justify-center gap-2 rounded px-5 py-2.5 ' +
    'text-body font-semibold transition-colors ' +
    'disabled:cursor-not-allowed disabled:opacity-60',
  {
    variants: {
      variante: {
        primary: 'bg-primary-500 text-white hover:bg-primary-600 active:bg-primary-700',
        secondary:
          'border-2 border-primary-500 bg-white text-primary-600 hover:bg-primary-50 active:bg-primary-100',
        ghost: 'text-primary-600 underline underline-offset-4 hover:bg-primary-50',
        danger: 'bg-danger text-white hover:brightness-90',
      },
      larghezza: {
        auto: '',
        piena: 'w-full',
      },
    },
    defaultVariants: { variante: 'primary', larghezza: 'auto' },
  },
)

export interface BottoneProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof bottoneVarianti> {}

export function Bottone({ className, variante, larghezza, type, ...props }: BottoneProps) {
  return (
    // type esplicito: dentro un form, un <button> senza type invia il modulo.
    // È il modo più comune di far partire una segnalazione per sbaglio.
    <button
      type={type ?? 'button'}
      className={cn(bottoneVarianti({ variante, larghezza }), className)}
      {...props}
    />
  )
}
