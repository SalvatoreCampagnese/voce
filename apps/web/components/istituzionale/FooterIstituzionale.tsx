import Link from 'next/link'

const REPO = 'https://github.com/SalvatoreCampagnese/voce'

export function FooterIstituzionale() {
  return (
    <footer className="on-dark mt-16 bg-surface-dark text-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 sm:grid-cols-3">
        <div>
          <p className="text-h4 font-bold">VOCE</p>
          <p className="mt-2 text-small text-white/80">
            Le segnalazioni dei cittadini diventano azioni collettive. Il codice è
            pubblico e verificabile da chiunque.
          </p>
        </div>

        <nav aria-label="Collegamenti utili">
          <p className="text-small font-semibold uppercase tracking-wide text-white/70">
            Il progetto
          </p>
          {/* Le voci sono passate da tre a cinque: con `gap-2` e un link alto
              quanto il testo, due bersagli da 20px distavano 8px l'uno
              dall'altro. Su un telefono in mano si sbaglia voce. `min-h-11`
              porta ogni link a 44px (WCAG 2.5.5) senza allargare la
              sottolineatura, che resta sul solo testo. */}
          <ul className="mt-2 flex flex-col text-small">
            <li>
              <Link href="/cosa-e" className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-primary-200">
                Cosa è VOCE
              </Link>
            </li>
            <li>
              <Link href="/trasparenza" className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-primary-200">
                Quadro pubblico
              </Link>
            </li>
            <li>
              <Link href="/dati" className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-primary-200">
                Dati aperti
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-primary-200">
                Come trattiamo i tuoi dati
              </Link>
            </li>
            <li>
              <a href={REPO} className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-primary-200">
                Codice sorgente su GitHub
              </a>
            </li>
          </ul>
        </nav>

        <div>
          <p className="text-small font-semibold uppercase tracking-wide text-white/70">
            Licenza
          </p>
          <p className="mt-3 text-small text-white/80">
            AGPL-3.0. Chi usa questo codice per offrire un servizio deve
            ripubblicare le proprie modifiche: un’infrastruttura civica non può
            diventare il prodotto chiuso di qualcuno.
          </p>
        </div>
      </div>

      <div className="border-t border-white/15">
        <p className="mx-auto max-w-6xl px-6 py-4 text-caption text-white/70">
          Le bozze degli atti sono generate con l’aiuto dell’intelligenza
          artificiale e revisionate da una persona prima di qualunque invio.
        </p>
      </div>
    </footer>
  )
}
