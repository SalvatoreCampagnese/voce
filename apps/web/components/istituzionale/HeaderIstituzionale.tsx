import Link from 'next/link'
import { Tricolore } from '@voce/ui'

const VOCI = [
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
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="flex items-center gap-3 rounded">
            <VoceLogo className="h-10 w-10 text-primary-700" />
            <span className="flex flex-col">
              <span className="text-h4 font-bold text-ink">VOCE</span>
              <span className="text-caption text-ink-muted">
                Il sindacato civico dei cittadini
              </span>
            </span>
          </Link>

          <nav aria-label="Navigazione principale">
            <ul className="flex flex-wrap items-center gap-1">
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
