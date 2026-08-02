import Link from 'next/link'
import type { Metadata } from 'next'
import { BarraProgresso, Breadcrumb, CardIstituzionale, TagStato } from '@voce/ui'
import { ACTION_KIND_LABELS, type ActionKind, type ActionStatus } from '@voce/db'
import { getAtti } from '@/lib/queries/public'

export const revalidate = 60

export const metadata: Metadata = {
  title: 'Atti',
  description:
    'Esposti, accessi civici e mozioni nati dalle segnalazioni dei cittadini.',
}

export default async function DossierPage() {
  const atti = await getAtti({ limite: 60 })

  return (
    <>
      <Breadcrumb voci={[{ etichetta: 'Home', href: '/' }, { etichetta: 'Atti' }]} />

      <h1 className="text-h1">Atti</h1>
      <p className="mt-3 max-w-2xl text-body text-ink-muted">
        Quando un gruppo diventa abbastanza numeroso, VOCE prepara gli atti da
        mandare a chi ha il dovere di rispondere. Ogni bozza è scritta con
        l’aiuto dell’intelligenza artificiale e revisionata da una persona prima
        di partire.
      </p>

      {atti.length === 0 ? (
        <CardIstituzionale className="mt-8">
          <h2 className="text-h4">Nessun atto ancora</h2>
          <p className="mt-2 text-body text-ink-muted">
            Gli atti nascono dai gruppi di segnalazioni. Guarda quali problemi
            stanno emergendo nella tua zona.
          </p>
          <Link
            href="/gruppi"
            className="mt-4 inline-block text-body font-semibold text-primary-600 underline underline-offset-4"
          >
            Vedi i gruppi attivi
          </Link>
        </CardIstituzionale>
      ) : (
        <ul className="mt-8 grid gap-6 sm:grid-cols-2">
          {atti.map((atto) => (
            <CardIstituzionale as="li" key={atto.id}>
              <div className="flex flex-wrap items-center gap-2">
                <TagStato stato={(atto.status ?? 'bozza') as ActionStatus} />
                <span className="text-caption text-ink-muted">
                  {ACTION_KIND_LABELS[atto.kind as ActionKind] ?? atto.kind}
                </span>
              </div>

              <h2 className="mt-3 text-h4">
                <Link href={`/dossier/${atto.id}`} className="hover:text-primary-700">
                  {atto.title}
                </Link>
              </h2>

              {atto.recipient && (
                <p className="mt-2 text-small text-ink-muted">
                  Destinatario: {atto.recipient}
                </p>
              )}

              <BarraProgresso
                className="mt-4"
                valore={atto.signatures_count ?? 0}
                obiettivo={atto.signatures_target ?? 50}
              />
            </CardIstituzionale>
          ))}
        </ul>
      )}
    </>
  )
}
