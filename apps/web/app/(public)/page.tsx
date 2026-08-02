import Link from 'next/link'
import { bottoneVarianti, CardIstituzionale, Numero, TagStato } from '@voce/ui'
import { CATEGORY_LABELS, type ClusterStatus } from '@voce/db'
import { getAtti, getGruppi, getStatistichePiattaforma } from '@/lib/queries/public'
import { BarraProgresso } from '@voce/ui'

// La pagina pubblica si rigenera ogni 60 secondi: i numeri non devono essere
// al secondo, ma non devono nemmeno essere di ieri.
export const revalidate = 60

const PASSI = [
  {
    titolo: 'Racconti',
    testo:
      'Scrivi cosa è successo nel tuo quartiere. In italiano normale, come lo diresti a un amico.',
  },
  {
    titolo: 'Uniamo',
    testo:
      'Confrontiamo la tua segnalazione con quelle degli altri. Se il problema è lo stesso, nasce un gruppo.',
  },
  {
    titolo: 'Agiamo',
    testo:
      'Quando siete abbastanza, prepariamo l’atto da mandare a chi deve rispondere. Lo firmi e lo controlli.',
  },
]

export default async function LandingPage() {
  const [statistiche, gruppi, atti] = await Promise.all([
    getStatistichePiattaforma(),
    getGruppi({ limite: 3 }),
    getAtti({ limite: 3 }),
  ])

  const attiInFirma = atti.filter((a) => a.status === 'in_firma')

  return (
    <>
      {/* ---------------------------------------------------------------- */}
      <section className="border-b border-surface-strong pb-12">
        <h1 className="max-w-3xl text-display text-ink">
          Il primo sindacato civico automatico
        </h1>
        <p className="mt-4 max-w-2xl text-h4 font-normal text-ink-muted">
          Racconta un problema del tuo quartiere. Se non sei da solo, VOCE lo
          trasforma in un’azione collettiva.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/segnala" className={bottoneVarianti({ variante: 'primary' })}>
            Segnala sul sito
          </Link>
          <a
            href="https://t.me/voce_civica_bot"
            className={bottoneVarianti({ variante: 'secondary' })}
          >
            Segnala su Telegram
          </a>
        </div>

        <p className="mt-6 max-w-2xl text-small text-ink-muted">
          Non serve registrarsi per raccontare. Ti chiediamo un contatto solo
          quando la tua segnalazione diventa un’azione da firmare.
        </p>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="border-b border-surface-strong py-10" aria-labelledby="numeri">
        <h2 id="numeri" className="sr-only">
          I numeri di VOCE
        </h2>
        <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <Numero valore={statistiche.cittadini} etichetta="cittadini che hanno segnalato" />
          <Numero valore={statistiche.gruppi} etichetta="gruppi di segnalazioni" />
          <Numero valore={statistiche.atti} etichetta="atti inviati" />
          <Numero valore={statistiche.risposte} etichetta="risposte ricevute" />
        </dl>
        {statistiche.cittadini === 0 && (
          <p className="mt-6 text-small text-ink-muted">
            Nessuna segnalazione ancora. Il primo gruppo nasce quando cinque
            persone raccontano lo stesso problema.
          </p>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="py-12" aria-labelledby="come-funziona">
        <h2 id="come-funziona" className="text-h2">
          Come funziona
        </h2>
        <ol className="mt-6 grid gap-6 sm:grid-cols-3">
          {PASSI.map((passo, i) => (
            <CardIstituzionale as="li" key={passo.titolo}>
              <span
                className="flex h-10 w-10 items-center justify-center rounded-pill bg-primary-50 text-h4 font-bold text-primary-700"
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <h3 className="mt-4 text-h4">{passo.titolo}</h3>
              <p className="mt-2 text-body text-ink-muted">{passo.testo}</p>
            </CardIstituzionale>
          ))}
        </ol>
      </section>

      {/* ---------------------------------------------------------------- */}
      {gruppi.length > 0 && (
        <section className="border-t border-surface-strong py-12" aria-labelledby="gruppi-attivi">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="gruppi-attivi" className="text-h2">
              Gruppi attivi
            </h2>
            <Link href="/gruppi" className="text-body font-semibold text-primary-600 underline underline-offset-4">
              Vedi tutti i gruppi
            </Link>
          </div>

          <ul className="mt-6 grid gap-6 sm:grid-cols-3">
            {gruppi.map((gruppo) => (
              <CardIstituzionale as="li" key={gruppo.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <TagStato stato={(gruppo.status ?? 'emergente') as ClusterStatus} />
                  <span className="text-caption text-ink-muted">
                    {CATEGORY_LABELS[gruppo.category ?? 'altro'] ?? 'Altro'}
                  </span>
                </div>
                <h3 className="mt-3 text-h4">
                  <Link href={`/gruppi/${gruppo.id}`} className="hover:text-primary-700">
                    {gruppo.title}
                  </Link>
                </h3>
                <p className="mt-2 text-small text-ink-muted">{gruppo.summary}</p>
                <p className="mt-4 text-small font-semibold text-ink">
                  {gruppo.citizens_count} cittadini · {gruppo.reports_count} segnalazioni
                </p>
              </CardIstituzionale>
            ))}
          </ul>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {attiInFirma.length > 0 && (
        <section className="border-t border-surface-strong py-12" aria-labelledby="in-firma">
          <h2 id="in-firma" className="text-h2">
            Atti in raccolta firme
          </h2>
          <ul className="mt-6 grid gap-6 sm:grid-cols-3">
            {attiInFirma.map((atto) => (
              <CardIstituzionale as="li" key={atto.id}>
                <h3 className="text-h4">
                  <Link href={`/dossier/${atto.id}`} className="hover:text-primary-700">
                    {atto.title}
                  </Link>
                </h3>
                <p className="mt-2 text-small text-ink-muted">
                  Destinatario: {atto.recipient ?? 'da definire'}
                </p>
                <BarraProgresso
                  className="mt-4"
                  valore={atto.signatures_count ?? 0}
                  obiettivo={atto.signatures_target ?? 50}
                />
              </CardIstituzionale>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
