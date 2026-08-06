'use client'

/**
 * 'use client' per una sola ragione: `usePathname()`.
 *
 * La voce di menu della pagina in cui ti trovi deve portare `aria-current`, che
 * è l'unico modo in cui uno screen reader dice «sei qui». Il percorso corrente
 * non è disponibile in un layout server, e non lo si vuole ricavare da un
 * header messo dal proxy: il proxy non è un livello applicativo.
 *
 * Il costo è una manciata di righe di JavaScript. Se non caricasse, il menu
 * resta un elenco di collegamenti funzionanti: si perde l'evidenziazione, non
 * la navigazione.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const VOCI = [
  { href: '/admin', etichetta: 'Riepilogo' },
  { href: '/admin/segnalazioni', etichetta: 'Segnalazioni' },
  { href: '/admin/gruppi', etichetta: 'Gruppi' },
  { href: '/admin/atti', etichetta: 'Atti' },
  { href: '/admin/risposte', etichetta: 'Risposte' },
  { href: '/admin/notifiche', etichetta: 'Notifiche' },
]

export function NavigazioneAdmin() {
  const percorso = usePathname()

  return (
    <nav aria-label="Sezioni del pannello" className="border-b border-surface-strong bg-white">
      <ul className="mx-auto flex max-w-6xl flex-wrap gap-1 px-6">
        {VOCI.map((voce) => {
          const attiva =
            voce.href === '/admin' ? percorso === '/admin' : percorso.startsWith(voce.href)

          return (
            <li key={voce.href}>
              <Link
                href={voce.href}
                aria-current={attiva ? 'page' : undefined}
                className={
                  'inline-flex min-h-11 items-center border-b-4 px-3 text-body font-semibold ' +
                  (attiva
                    ? 'border-primary-500 text-primary-700'
                    : 'border-transparent text-ink hover:bg-primary-50 hover:text-primary-700')
                }
              >
                {voce.etichetta}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
