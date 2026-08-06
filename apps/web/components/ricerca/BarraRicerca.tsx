import Link from 'next/link'
import { Bottone } from '@voce/ui'

/**
 * Barra di ricerca dei gruppi pubblici (PLAN2 §4.1).
 *
 * È un Server Component e resta un `<form method="get">`: senza JavaScript
 * scrive `?q=` nella barra degli indirizzi e la pagina la legge da
 * `searchParams`. Chi cerca da un telefono vecchio con la rete che va e viene
 * non deve aspettare un bundle per porre una domanda.
 *
 * L'etichetta è visibile e non affidata al placeholder: il placeholder sparisce
 * appena si scrive e diversi screen reader non lo annunciano affatto.
 */
export function BarraRicerca({
  valore,
  categoria,
  citta,
}: {
  valore?: string
  /** Filtro attivo da conservare attraverso la ricerca. */
  categoria?: string
  /** Filtro attivo da conservare attraverso la ricerca. */
  citta?: string
}) {
  return (
    <search className="mt-6">
      <form method="get" action="/gruppi" className="flex flex-col gap-2">
        {/* I filtri già scelti viaggiano con la ricerca: chi ha selezionato
            "sanità" e poi cerca non deve ritrovarsi l'elenco intero. */}
        {categoria && <input type="hidden" name="categoria" value={categoria} />}
        {citta && <input type="hidden" name="citta" value={citta} />}

        <label htmlFor="q" className="text-body font-semibold text-ink">
          Cerca fra i gruppi
        </label>
        <p id="q-aiuto" className="text-small text-ink-muted">
          Scrivi il problema con parole tue. Cerchiamo per significato, non per
          parole esatte.
        </p>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={valore ?? ''}
            maxLength={200}
            enterKeyHint="search"
            aria-describedby="q-aiuto"
            placeholder="Es. buche in via Ferrari"
            className="min-h-11 w-full rounded border border-border-control bg-white px-3 py-2 text-body text-ink placeholder:text-ink-subtle"
          />
          <Bottone type="submit" className="sm:w-auto">
            Cerca
          </Bottone>
        </div>

        {valore && (
          <p className="text-small">
            <Link
              href={
                categoria
                  ? `/gruppi?categoria=${encodeURIComponent(categoria)}`
                  : '/gruppi'
              }
              className="inline-flex min-h-11 items-center font-semibold text-primary-600 underline underline-offset-4"
            >
              Torna a tutti i gruppi
            </Link>
          </p>
        )}
      </form>
    </search>
  )
}
