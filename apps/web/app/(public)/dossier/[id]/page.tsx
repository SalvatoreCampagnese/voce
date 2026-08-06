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
  TagStato,
  bottoneVarianti,
} from '@voce/ui'
import {
  ACTION_KIND_LABELS,
  ACTION_STATUS_LABELS,
  type ActionKind,
  type ActionStatus,
} from '@voce/db'
import { getAtto, getGruppo } from '@/lib/queries/public'

export const revalidate = 60

export async function generateMetadata({ params }: PageProps<'/dossier/[id]'>): Promise<Metadata> {
  const { id } = await params
  const atto = await getAtto(id)
  if (!atto) return { title: 'Atto non trovato' }
  return { title: atto.title ?? 'Atto', description: `Destinatario: ${atto.recipient ?? 'da definire'}` }
}

const CRONOLOGIA: ActionStatus[] = ['bozza', 'in_firma', 'inviata', 'risposta_ricevuta']

export default async function AttoPage({ params }: PageProps<'/dossier/[id]'>) {
  const { id } = await params
  const atto = await getAtto(id)
  if (!atto) notFound()

  const gruppo = atto.cluster_id ? await getGruppo(atto.cluster_id) : null
  const statoCorrente = (atto.status ?? 'bozza') as ActionStatus
  const indiceCorrente = CRONOLOGIA.indexOf(statoCorrente)

  return (
    <>
      <Breadcrumb
        voci={[
          { etichetta: 'Home', href: '/' },
          { etichetta: 'Atti', href: '/dossier' },
          { etichetta: atto.title ?? 'Atto' },
        ]}
      />

      <div className="grid gap-10 lg:grid-cols-[2fr_1fr]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <TagStato stato={statoCorrente} />
            <span className="text-small text-ink-muted">
              {ACTION_KIND_LABELS[atto.kind as ActionKind] ?? atto.kind}
            </span>
          </div>

          <h1 className="mt-3 text-h1">{atto.title}</h1>

          <p className="mt-3 text-body text-ink-muted">
            Destinatario: <strong className="text-ink">{atto.recipient ?? 'da definire'}</strong>
            {gruppo && (
              <>
                {' · '}
                nato dal gruppo{' '}
                <Link
                  href={`/gruppi/${gruppo.id}`}
                  className="font-semibold text-primary-600 underline underline-offset-2"
                >
                  {gruppo.title}
                </Link>
              </>
            )}
          </p>

          <CalloutAvviso tono="attenzione" titolo="Bozza assistita dall’AI" className="mt-6">
            Questo testo è stato scritto con l’aiuto dell’intelligenza artificiale
            a partire dalle segnalazioni dei cittadini
            {atto.reviewed_by ? ` e revisionato da ${atto.reviewed_by}` : ''}. Nessun
            atto viene inviato senza che una persona lo abbia letto e approvato.
          </CalloutAvviso>

          {atto.body_markdown ? (
            <article className="prose-voce mt-8">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {atto.body_markdown}
              </ReactMarkdown>
            </article>
          ) : (
            // Il testo esiste, ma non è ancora stato letto da una persona.
            // Pubblicarlo prima significherebbe mettere online un documento
            // scritto da una macchina, che può contenere fatti non verificati
            // o dati di persone che non hanno segnalato nulla.
            <CalloutAvviso tono="info" titolo="Testo non ancora pubblicato" className="mt-8">
              La bozza è stata preparata ma nessuno l’ha ancora revisionata. Il
              testo diventa pubblico solo dopo che una persona se ne è assunta
              la responsabilità, con nome e cognome. Fino ad allora restano
              visibili il tipo di atto, il destinatario e il gruppo di origine.
            </CalloutAvviso>
          )}
        </div>

        <aside className="flex flex-col gap-6">
          <CardIstituzionale>
            <h2 className="text-h4">Firme</h2>
            <BarraProgresso
              className="mt-4"
              valore={atto.signatures_count ?? 0}
              obiettivo={atto.signatures_target ?? 50}
            />
            <p className="mt-4 text-small text-ink-muted">
              La raccolta firme si apre quando l’atto passa in revisione.
            </p>
            <Link
              href="/segnala"
              className={`${bottoneVarianti({ variante: 'secondary', larghezza: 'piena' })} mt-4`}
            >
              Aggiungi la tua segnalazione
            </Link>
          </CardIstituzionale>

          <CardIstituzionale>
            <h2 className="text-h4">A che punto è</h2>
            <ol className="mt-4 flex flex-col gap-3">
              {CRONOLOGIA.map((stato, i) => {
                const fatto = indiceCorrente >= i
                return (
                  <li key={stato} className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-pill text-caption font-bold ${
                        fatto ? 'bg-primary-500 text-white' : 'bg-surface-alt text-ink-subtle'
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className={fatto ? 'text-body font-semibold text-ink' : 'text-body text-ink-muted'}>
                      {ACTION_STATUS_LABELS[stato]}
                      {stato === statoCorrente && (
                        <span className="sr-only"> — fase attuale</span>
                      )}
                    </span>
                  </li>
                )
              })}
            </ol>
          </CardIstituzionale>

          {atto.response_text && (
            <CardIstituzionale>
              <h2 className="text-h4">Risposta ricevuta</h2>
              <p className="mt-3 text-body text-ink-muted">{atto.response_text}</p>
            </CardIstituzionale>
          )}
        </aside>
      </div>
    </>
  )
}
