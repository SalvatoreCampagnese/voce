import type { ReactNode } from 'react'
import { Breadcrumb } from '@voce/ui'

/**
 * Testata di una pagina del pannello: percorso di navigazione, unico `<h1>`
 * della pagina, una frase che dice a cosa serve la coda che si sta guardando.
 *
 * Sta in un componente e non copiata in ogni pagina perché il pannello cresce:
 * la terza pagina scritta a mano è quella in cui compaiono due `<h1>`.
 */
export function IntestazionePagina({
  titolo,
  descrizione,
  percorso,
  azioni,
}: {
  titolo: string
  descrizione?: string
  /** Voci dopo «Pannello»: la prima voce del percorso è sempre quella. */
  percorso?: { etichetta: string; href?: string }[]
  /** Collegamenti o moduli allineati a destra del titolo. */
  azioni?: ReactNode
}) {
  return (
    <div className="mb-8">
      <Breadcrumb voci={[{ etichetta: 'Pannello', href: '/admin' }, ...(percorso ?? [])]} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-h1">{titolo}</h1>
          {descrizione && (
            <p className="mt-2 max-w-3xl text-body text-ink-muted">{descrizione}</p>
          )}
        </div>
        {azioni && <div className="flex flex-wrap items-center gap-3">{azioni}</div>}
      </div>
    </div>
  )
}
