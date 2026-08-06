import Link from 'next/link'
import type { Metadata } from 'next'
import { Breadcrumb } from '@voce/ui'
import { ModuloSegnalazione } from './ModuloSegnalazione'

export const metadata: Metadata = {
  title: 'Segnala un problema',
  description:
    'Racconta un problema del tuo quartiere. Se non sei da solo, diventa un’azione collettiva.',
}

export default function SegnalaPage() {
  return (
    <>
      <Breadcrumb voci={[{ etichetta: 'Home', href: '/' }, { etichetta: 'Segnala' }]} />

      <div className="max-w-2xl">
        <h1 className="text-h1">Racconta cosa non va</h1>
        <p className="mt-3 text-body text-ink-muted">
          Descrivi il problema con parole tue. Confrontiamo il tuo racconto con
          quelli degli altri cittadini della tua zona: se il problema è lo stesso,
          insieme diventate un gruppo.
        </p>

        {/* Il collegamento viene PRIMA del modulo ma non lo sostituisce: chi
            vuole guardare prima può farlo, chi vuole scrivere subito scorre di
            una riga. Il testo dice «aggiungi», mai «esiste già». */}
        <p className="mt-3 text-small text-ink-muted">
          Vuoi vedere se qualcuno ne ha già parlato?{' '}
          <Link
            href="/gruppi"
            className="font-semibold text-primary-600 underline underline-offset-4"
          >
            Cerca fra i gruppi attivi
          </Link>
          . Anche se ne trovi uno, la tua voce serve lo stesso.
        </p>

        <div className="mt-8">
          <ModuloSegnalazione />
        </div>
      </div>
    </>
  )
}
