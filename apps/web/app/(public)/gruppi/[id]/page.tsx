import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  BarraProgresso,
  Breadcrumb,
  CalloutAvviso,
  CardIstituzionale,
  Numero,
  TagStato,
} from '@voce/ui'
import { ACTION_KIND_LABELS, CATEGORY_LABELS, type ActionKind, type ClusterStatus } from '@voce/db'
import { getAtti, getGruppo, getSegnalazioniDelGruppo } from '@/lib/queries/public'

export const revalidate = 60

export async function generateMetadata({ params }: PageProps<'/gruppi/[id]'>): Promise<Metadata> {
  const { id } = await params
  const gruppo = await getGruppo(id)
  if (!gruppo) return { title: 'Gruppo non trovato' }
  return {
    title: gruppo.title ?? 'Gruppo',
    description: gruppo.summary ?? undefined,
    openGraph: { title: gruppo.title ?? 'Gruppo', description: gruppo.summary ?? undefined },
  }
}

export default async function GruppoPage({ params }: PageProps<'/gruppi/[id]'>) {
  const { id } = await params
  const gruppo = await getGruppo(id)
  if (!gruppo) notFound()

  const [segnalazioni, atti] = await Promise.all([
    getSegnalazioniDelGruppo(id),
    getAtti({ clusterId: id }),
  ])

  const formattaData = (valore: string | null) =>
    valore ? new Date(valore).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }) : ''

  const cronologia = gruppo.timeline_markdown?.trim()

  return (
    <>
      <Breadcrumb
        voci={[
          { etichetta: 'Home', href: '/' },
          { etichetta: 'Gruppi attivi', href: '/gruppi' },
          { etichetta: gruppo.title ?? 'Gruppo' },
        ]}
      />

      <div className="grid gap-10 lg:grid-cols-[2fr_1fr]">
        {/* --- Colonna principale ------------------------------------------ */}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <TagStato stato={(gruppo.status ?? 'emergente') as ClusterStatus} />
            <span className="text-small text-ink-muted">
              {CATEGORY_LABELS[gruppo.category ?? 'altro'] ?? 'Altro'}
              {gruppo.city ? ` · ${gruppo.city}` : ''}
              {gruppo.neighborhood ? ` · ${gruppo.neighborhood}` : ''}
            </span>
          </div>

          <h1 className="mt-3 text-h1">{gruppo.title}</h1>
          <p className="mt-4 text-h4 font-normal text-ink-muted">{gruppo.summary}</p>

          {cronologia && (
            <section className="mt-10" aria-labelledby="cronologia">
              <h2 id="cronologia" className="text-h3">
                Come è andata finora
              </h2>
              {gruppo.timeline_updated_at && (
                <p className="mt-1 text-caption text-ink-muted">
                  Aggiornato il {formattaData(gruppo.timeline_updated_at)}
                </p>
              )}

              {/* I titoli prodotti dal modello diventano `h3`: la pagina ha già
                  il suo unico `<h1>` e la sua gerarchia, e un titolo di livello
                  sbagliato disorienta chi naviga con uno screen reader.
                  Il testo salvato è già ripulito, questa è la seconda rete. */}
              <div className="prose-voce mt-4">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{ h1: 'h3', h2: 'h3' }}
                >
                  {cronologia}
                </ReactMarkdown>
              </div>

              <CalloutAvviso
                tono="info"
                titolo="Riassunto scritto da un programma"
                className="mt-4"
              >
                Questo testo è generato automaticamente dalle segnalazioni
                pubbliche del gruppo. Può contenere imprecisioni. I racconti
                originali sono qui sotto.
              </CalloutAvviso>
            </section>
          )}

          <section className="mt-10" aria-labelledby="racconti">
            <h2 id="racconti" className="text-h3">
              Cosa raccontano i cittadini
            </h2>
            <p className="mt-2 text-small text-ink-muted">
              I testi sono anonimizzati: nomi, numeri civici e riferimenti
              personali vengono rimossi prima della pubblicazione.
            </p>

            <ol className="mt-6 flex flex-col gap-4">
              {segnalazioni.map((segnalazione) => (
                <li
                  key={segnalazione.id}
                  className="border-l-4 border-surface-strong pl-4"
                >
                  <p className="text-caption text-ink-muted">
                    {formattaData(segnalazione.created_at)}
                  </p>
                  <p className="mt-1 text-body text-ink">{segnalazione.anon_text}</p>
                </li>
              ))}
            </ol>

            {segnalazioni.length === 0 && (
              <p className="mt-4 text-body text-ink-muted">
                Nessun racconto pubblicabile per questo gruppo.
              </p>
            )}
          </section>
        </div>

        {/* --- Colonna laterale --------------------------------------------- */}
        <aside className="flex flex-col gap-6">
          <CardIstituzionale>
            <h2 className="text-h4">I numeri</h2>
            <dl className="mt-4 flex flex-col gap-4">
              <Numero valore={gruppo.citizens_count ?? 0} etichetta="cittadini distinti" />
              <Numero valore={gruppo.reports_count ?? 0} etichetta="segnalazioni" />
            </dl>
          </CardIstituzionale>

          <CardIstituzionale>
            <h2 className="text-h4">Atti collegati</h2>

            {atti.length === 0 ? (
              <p className="mt-3 text-small text-ink-muted">
                Nessun atto ancora. Le bozze vengono preparate quando abbastanza
                cittadini diversi segnalano lo stesso problema.
              </p>
            ) : (
              <ul className="mt-4 flex flex-col gap-5">
                {atti.map((atto) => (
                  <li key={atto.id}>
                    <p className="text-caption text-ink-muted">
                      {ACTION_KIND_LABELS[atto.kind as ActionKind] ?? atto.kind}
                    </p>
                    <Link
                      href={`/dossier/${atto.id}`}
                      className="text-body font-semibold text-primary-600 underline underline-offset-4"
                    >
                      {atto.title}
                    </Link>
                    <BarraProgresso
                      className="mt-2"
                      valore={atto.signatures_count ?? 0}
                      obiettivo={atto.signatures_target ?? 50}
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardIstituzionale>

          <CalloutAvviso tono="info" titolo="Hai lo stesso problema?">
            Raccontalo anche tu: ogni segnalazione in più rende il gruppo più
            difficile da ignorare.{' '}
            <Link href="/segnala" className="font-semibold underline underline-offset-2">
              Segnala
            </Link>
          </CalloutAvviso>
        </aside>
      </div>
    </>
  )
}
