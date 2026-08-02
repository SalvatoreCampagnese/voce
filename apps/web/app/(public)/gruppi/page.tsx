import Link from 'next/link'
import type { Metadata } from 'next'
import { Breadcrumb, CardIstituzionale, TagStato } from '@voce/ui'
import { CATEGORY_LABELS, type ClusterStatus } from '@voce/db'
import { getGruppi } from '@/lib/queries/public'

export const revalidate = 60

export const metadata: Metadata = {
  title: 'Gruppi attivi',
  description:
    'I problemi segnalati da più cittadini nella stessa zona, raccolti in gruppi.',
}

export default async function GruppiPage({
  searchParams,
}: PageProps<'/gruppi'>) {
  // Next 16: searchParams è una Promise.
  const filtri = await searchParams
  const citta = typeof filtri.citta === 'string' ? filtri.citta : undefined
  const categoria = typeof filtri.categoria === 'string' ? filtri.categoria : undefined

  const gruppi = await getGruppi({ citta, categoria, limite: 60 })

  const categorie = [...new Set(gruppi.map((g) => g.category).filter(Boolean))] as string[]

  return (
    <>
      <Breadcrumb voci={[{ etichetta: 'Home', href: '/' }, { etichetta: 'Gruppi attivi' }]} />

      <h1 className="text-h1">Gruppi attivi</h1>
      <p className="mt-3 max-w-2xl text-body text-ink-muted">
        Ogni gruppo raccoglie le segnalazioni di più cittadini sullo stesso
        problema. Compaiono qui solo quando almeno tre persone diverse hanno
        raccontato la stessa cosa.
      </p>

      {categorie.length > 1 && (
        <nav aria-label="Filtra per categoria" className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/gruppi"
            className={`inline-flex min-h-11 items-center rounded-pill px-4 text-small font-semibold ${
              categoria ? 'bg-surface-alt text-ink' : 'bg-primary-500 text-white'
            }`}
          >
            Tutte
          </Link>
          {categorie.map((c) => (
            <Link
              key={c}
              href={`/gruppi?categoria=${encodeURIComponent(c)}`}
              className={`inline-flex min-h-11 items-center rounded-pill px-4 text-small font-semibold ${
                categoria === c ? 'bg-primary-500 text-white' : 'bg-surface-alt text-ink'
              }`}
            >
              {CATEGORY_LABELS[c] ?? c}
            </Link>
          ))}
        </nav>
      )}

      {gruppi.length === 0 ? (
        <CardIstituzionale className="mt-8">
          <h2 className="text-h4">Ancora nessun gruppo</h2>
          <p className="mt-2 text-body text-ink-muted">
            Un gruppo nasce quando più persone segnalano lo stesso problema nella
            stessa zona. Se hai qualcosa da raccontare, comincia tu.
          </p>
          <Link
            href="/segnala"
            className="mt-4 inline-block text-body font-semibold text-primary-600 underline underline-offset-4"
          >
            Segnala un problema
          </Link>
        </CardIstituzionale>
      ) : (
        <ul className="mt-8 grid gap-6 sm:grid-cols-2">
          {gruppi.map((gruppo) => (
            <CardIstituzionale as="li" key={gruppo.id}>
              <div className="flex flex-wrap items-center gap-2">
                <TagStato stato={(gruppo.status ?? 'emergente') as ClusterStatus} />
                <span className="text-caption text-ink-muted">
                  {CATEGORY_LABELS[gruppo.category ?? 'altro'] ?? 'Altro'}
                  {gruppo.city ? ` · ${gruppo.city}` : ''}
                </span>
              </div>

              <h2 className="mt-3 text-h4">
                <Link href={`/gruppi/${gruppo.id}`} className="hover:text-primary-700">
                  {gruppo.title}
                </Link>
              </h2>

              <p className="mt-2 text-small text-ink-muted">{gruppo.summary}</p>

              <p className="mt-4 text-small font-semibold text-ink">
                {gruppo.citizens_count} cittadini · {gruppo.reports_count} segnalazioni
              </p>
            </CardIstituzionale>
          ))}
        </ul>
      )}
    </>
  )
}
