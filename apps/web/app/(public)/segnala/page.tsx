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

        <div className="mt-8">
          <ModuloSegnalazione />
        </div>
      </div>
    </>
  )
}
