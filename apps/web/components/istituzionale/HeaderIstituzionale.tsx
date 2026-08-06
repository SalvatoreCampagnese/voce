import Link from 'next/link'
import { Tricolore } from '@voce/ui'

const VOCI = [
  // Prima voce, prima di «Segnala»: chi arriva da un link condiviso spesso non
  // sa ancora cos'è questo sito, e la risposta non deve stare in fondo al menu.
  { href: '/cosa-e', etichetta: 'Cosa è' },
  { href: '/segnala', etichetta: 'Segnala' },
  { href: '/gruppi', etichetta: 'Gruppi attivi' },
  { href: '/dossier', etichetta: 'Atti' },
  { href: '/trasparenza', etichetta: 'Trasparenza' },
]

/** Logo: una V che è anche un'onda sonora. Nessuna dipendenza esterna. */
function VoceLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true" fill="none">
      <rect width="40" height="40" rx="4" fill="currentColor" />
      <path
        d="M10 13v14M15 16v8M20 10v20M25 16v8M30 13v14"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function HeaderIstituzionale() {
  return (
    <>
      <Tricolore />
      <header className="border-b border-surface-strong bg-white">
        {/* Su telefono logo e menu stanno incolonnati: da cinque voci in su, con
            `justify-between`, il menu andava a capo allineandosi a destra e le
            voci finivano in colonne diverse a ogni riga. Da `sm` in su torna la
            barra orizzontale di prima. Nessun JavaScript: un menu a tendina
            costerebbe uno stato client su ogni pagina del sito. */}
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
          <Link href="/" className="flex items-center gap-3 rounded">
            <VoceLogo className="h-10 w-10 text-primary-700" />
            <span className="flex flex-col">
              <span className="text-h4 font-bold text-ink">VOCE</span>
              <span className="text-caption text-ink-muted">
                Il sindacato civico dei cittadini
              </span>
            </span>
          </Link>

          <nav aria-label="Navigazione principale" className="w-full sm:w-auto">
            {/* -mx-3 compensa il px-3 dei link: il testo della prima voce resta
                allineato al logo, l'ultima al bordo destro del contenitore.
                gap-y-1 tiene le righe leggibili quando il menu va a capo, cosa
                che succede su telefono e con il testo ingrandito al 200%. */}
            <ul className="-mx-3 flex flex-wrap items-center gap-x-1 gap-y-1">
              {VOCI.map((voce) => (
                <li key={voce.href}>
                  <Link
                    href={voce.href}
                    className="inline-flex min-h-11 items-center rounded px-3 py-2 text-body font-semibold text-ink hover:bg-primary-50 hover:text-primary-700"
                  >
                    {voce.etichetta}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>
    </>
  )
}
