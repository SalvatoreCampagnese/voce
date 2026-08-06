import Link from 'next/link'
import type { Metadata } from 'next'
import { Breadcrumb, CardIstituzionale, TagStato } from '@voce/ui'
import { CATEGORY_LABELS, type ClusterStatus } from '@voce/db'
import { BarraRicerca } from '@/components/ricerca/BarraRicerca'
import { getGruppi } from '@/lib/queries/public'
import { cercaGruppi } from '@/lib/queries/ricerca'

/**
 * La pagina legge `searchParams`, quindi Next la rende a ogni richiesta: il
 * `revalidate` non produce più una pagina statica. Resta dichiarato lo stesso
 * perché vale per la voce di rotta nel manifest e perché il giorno in cui la
 * ricerca finisse in un segmento separato (o si abilitasse il rendering
 * parziale) l'elenco tornerebbe a essere cacheabile senza altre modifiche.
 *
 * Il costo di una richiesta senza `?q=` resta quello di una sola query alla
 * vista `public_clusters`: nessuna chiamata a OpenAI se non si cerca nulla.
 */
export const revalidate = 60

export async function generateMetadata(props: PageProps<'/gruppi'>): Promise<Metadata> {
  const filtri = await props.searchParams
  const q = typeof filtri.q === 'string' ? filtri.q.trim() : ''

  if (q) {
    return {
      title: `Cerca fra i gruppi: ${q.slice(0, 60)}`,
      description:
        'Risultati della ricerca fra i gruppi attivi segnalati dai cittadini.',
      // Una pagina di risultati non va indicizzata: ogni query costa un
      // embedding, e un crawler che segue link generati li paga tutti.
      robots: { index: false, follow: true },
    }
  }

  return {
    title: 'Gruppi attivi',
    description:
      'I problemi segnalati da più cittadini nella stessa zona, raccolti in gruppi.',
  }
}

/** Forma comune fra l'elenco (vista public_clusters) e la ricerca semantica. */
interface VoceElenco {
  id: string
  title: string | null
  summary: string | null
  category: string | null
  city: string | null
  status: string | null
  citizens_count: number
  reports_count: number
}

export default async function GruppiPage({ searchParams }: PageProps<'/gruppi'>) {
  // Next 16: searchParams è una Promise.
  const filtri = await searchParams
  const citta = typeof filtri.citta === 'string' ? filtri.citta : undefined
  const categoria = typeof filtri.categoria === 'string' ? filtri.categoria : undefined
  // 200 caratteri: il taglio avviene comunque dentro cercaGruppi, qui serve a
  // non stampare in pagina un testo lungo quanto un romanzo.
  const q = typeof filtri.q === 'string' ? filtri.q.trim().slice(0, 200) : ''

  // L'elenco completo serve comunque: da qui nascono le pastiglie dei filtri.
  // Ricavarle dai risultati già filtrati faceva sparire la pastiglia "Tutte"
  // appena si sceglieva una categoria, e da lì non si tornava più indietro.
  const elencoBase = await getGruppi({ citta, limite: 60 })
  const categorie = [
    ...new Set(elencoBase.map((g) => g.category).filter(Boolean)),
  ] as string[]

  let voci: VoceElenco[]

  if (q) {
    const trovati = await cercaGruppi(q, { citta, limite: 20 })
    // La RPC non filtra per categoria: il filtro resta attivo insieme alla
    // ricerca, applicato qui sui risultati già ordinati per pertinenza.
    voci = trovati
      .filter((g) => !categoria || g.category === categoria)
      .map((g) => ({
        id: g.clusterId,
        title: g.title,
        summary: g.summary,
        category: g.category,
        city: g.city,
        // La ricerca restituisce solo gruppi già pubblici: lo stato serve
        // all'etichetta, non a decidere cosa mostrare.
        status: null,
        citizens_count: g.citizensCount,
        reports_count: g.reportsCount,
      }))
  } else {
    voci = elencoBase
      // `id` è nullable nel tipo della vista: una riga senza id non è
      // collegabile, quindi non ha senso mostrarla.
      .filter((g): g is typeof g & { id: string } => g.id !== null)
      .filter((g) => !categoria || g.category === categoria)
      .map((g) => ({
        id: g.id,
        title: g.title,
        summary: g.summary,
        category: g.category,
        city: g.city,
        status: g.status,
        citizens_count: g.citizens_count ?? 0,
        reports_count: g.reports_count ?? 0,
      }))
  }

  /** Costruisce un href che conserva gli altri filtri attivi. */
  function href(nuovaCategoria?: string): string {
    const parametri = new URLSearchParams()
    if (q) parametri.set('q', q)
    if (citta) parametri.set('citta', citta)
    if (nuovaCategoria) parametri.set('categoria', nuovaCategoria)
    const stringa = parametri.toString()
    return stringa ? `/gruppi?${stringa}` : '/gruppi'
  }

  return (
    <>
      <Breadcrumb voci={[{ etichetta: 'Home', href: '/' }, { etichetta: 'Gruppi attivi' }]} />

      <h1 className="text-h1">Gruppi attivi</h1>
      <p className="mt-3 max-w-2xl text-body text-ink-muted">
        Ogni gruppo raccoglie le segnalazioni di più cittadini sullo stesso
        problema. Compaiono qui solo quando almeno tre persone diverse hanno
        raccontato la stessa cosa.
      </p>

      <BarraRicerca valore={q} categoria={categoria} citta={citta} />

      {categorie.length > 1 && (
        <nav aria-label="Filtra per categoria" className="mt-6 flex flex-wrap gap-2">
          <Link
            href={href()}
            aria-current={categoria ? undefined : 'true'}
            className={`inline-flex min-h-11 items-center rounded-pill px-4 text-small font-semibold ${
              categoria ? 'bg-surface-alt text-ink' : 'bg-primary-500 text-white'
            }`}
          >
            Tutte
          </Link>
          {categorie.map((c) => (
            <Link
              key={c}
              href={href(c)}
              aria-current={categoria === c ? 'true' : undefined}
              className={`inline-flex min-h-11 items-center rounded-pill px-4 text-small font-semibold ${
                categoria === c ? 'bg-primary-500 text-white' : 'bg-surface-alt text-ink'
              }`}
            >
              {CATEGORY_LABELS[c] ?? c}
            </Link>
          ))}
        </nav>
      )}

      {q && voci.length > 0 && (
        <p className="mt-6 text-small text-ink-muted" role="status">
          {voci.length === 1
            ? 'Un gruppo somiglia a quello che cerchi.'
            : `${voci.length} gruppi somigliano a quello che cerchi.`}{' '}
          Sono ordinati dal più pertinente.
        </p>
      )}

      {voci.length === 0 ? (
        <CardIstituzionale className="mt-8">
          {q ? (
            <>
              <h2 className="text-h4">Nessun gruppo su questo</h2>
              <p className="mt-2 text-body text-ink-muted">
                Vuol dire che sei il primo a parlarne. Raccontalo tu: quando
                altri diranno la stessa cosa, il gruppo nasce.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-h4">Ancora nessun gruppo</h2>
              <p className="mt-2 text-body text-ink-muted">
                Un gruppo nasce quando più persone segnalano lo stesso problema
                nella stessa zona. Se hai qualcosa da raccontare, comincia tu.
              </p>
            </>
          )}
          <Link
            href="/segnala"
            className="mt-4 inline-flex min-h-11 items-center text-body font-semibold text-primary-600 underline underline-offset-4"
          >
            Segnala un problema
          </Link>
        </CardIstituzionale>
      ) : (
        <ul className="mt-8 grid gap-6 sm:grid-cols-2">
          {voci.map((voce) => (
            <CardIstituzionale as="li" key={voce.id}>
              <div className="flex flex-wrap items-center gap-2">
                {voce.status && <TagStato stato={voce.status as ClusterStatus} />}
                <span className="text-caption text-ink-muted">
                  {CATEGORY_LABELS[voce.category ?? 'altro'] ?? 'Altro'}
                  {voce.city ? ` · ${voce.city}` : ''}
                </span>
              </div>

              <h2 className="mt-3 text-h4">
                <Link href={`/gruppi/${voce.id}`} className="hover:text-primary-700">
                  {voce.title}
                </Link>
              </h2>

              <p className="mt-2 text-small text-ink-muted">{voce.summary}</p>

              <p className="mt-4 text-small font-semibold text-ink">
                {voce.citizens_count} cittadini · {voce.reports_count} segnalazioni
              </p>
            </CardIstituzionale>
          ))}
        </ul>
      )}
    </>
  )
}
