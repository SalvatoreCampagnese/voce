import Link from 'next/link'
import type { Metadata } from 'next'
import { Breadcrumb, CardIstituzionale, Numero } from '@voce/ui'
import { getStatisticheComuni } from '@/lib/queries/public'

export const revalidate = 60

export const metadata: Metadata = {
  title: 'Quadro pubblico',
  description:
    'Quante segnalazioni, quanti gruppi, quanti atti inviati e quante risposte ricevute, comune per comune.',
}

export default async function TrasparenzaPage() {
  const comuni = await getStatisticheComuni()

  const totali = comuni.reduce(
    (acc, c) => ({
      gruppi: acc.gruppi + Number(c.clusters_count ?? 0),
      segnalazioni: acc.segnalazioni + Number(c.reports_count ?? 0),
      cittadini: acc.cittadini + Number(c.citizens_count ?? 0),
      inviati: acc.inviati + Number(c.actions_sent ?? 0),
      risposte: acc.risposte + Number(c.responses_received ?? 0),
    }),
    { gruppi: 0, segnalazioni: 0, cittadini: 0, inviati: 0, risposte: 0 },
  )

  const percentualeRisposte =
    totali.inviati > 0 ? Math.round((totali.risposte / totali.inviati) * 100) : null

  return (
    <>
      <Breadcrumb voci={[{ etichetta: 'Home', href: '/' }, { etichetta: 'Trasparenza' }]} />

      <h1 className="text-h1">Quadro pubblico</h1>
      <p className="mt-3 max-w-2xl text-body text-ink-muted">
        Tutto quello che VOCE produce è verificabile. Qui trovi quanti problemi
        sono stati segnalati, quanti atti sono partiti e — soprattutto — quante
        volte le amministrazioni hanno risposto.
      </p>

      <section className="mt-10 border-y border-surface-strong py-8" aria-labelledby="totali">
        <h2 id="totali" className="sr-only">
          Totali
        </h2>
        <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <Numero valore={totali.cittadini} etichetta="cittadini" />
          <Numero valore={totali.gruppi} etichetta="gruppi" />
          <Numero valore={totali.inviati} etichetta="atti inviati" />
          <Numero
            valore={percentualeRisposte === null ? '—' : `${percentualeRisposte}%`}
            etichetta="atti con risposta"
          />
        </dl>
      </section>

      <section className="mt-10" aria-labelledby="per-comune">
        <h2 id="per-comune" className="text-h3">
          Comune per comune
        </h2>

        {comuni.length === 0 ? (
          <CardIstituzionale className="mt-6">
            <p className="text-body text-ink-muted">
              Non ci sono ancora dati pubblici. Compaiono qui appena si forma il
              primo gruppo con almeno tre cittadini diversi.
            </p>
            <Link
              href="/segnala"
              className="mt-4 inline-block text-body font-semibold text-primary-600 underline underline-offset-4"
            >
              Segnala un problema
            </Link>
          </CardIstituzionale>
        ) : (
          // overflow-x-auto: su un telefono la tabella scorre da sola invece di
          // far scorrere l'intera pagina in orizzontale.
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-body">
              <caption className="sr-only">
                Segnalazioni, gruppi, atti inviati e risposte ricevute per comune
              </caption>
              <thead>
                <tr className="border-b-2 border-surface-strong text-left">
                  <th scope="col" className="py-3 pr-4 font-semibold">Comune</th>
                  <th scope="col" className="py-3 pr-4 font-semibold">Cittadini</th>
                  <th scope="col" className="py-3 pr-4 font-semibold">Gruppi</th>
                  <th scope="col" className="py-3 pr-4 font-semibold">Atti inviati</th>
                  <th scope="col" className="py-3 font-semibold">Risposte</th>
                </tr>
              </thead>
              <tbody>
                {comuni.map((comune) => (
                  <tr key={comune.city} className="border-b border-surface-strong">
                    <th scope="row" className="py-3 pr-4 text-left font-semibold text-ink">
                      {comune.city}
                    </th>
                    <td className="py-3 pr-4">{comune.citizens_count}</td>
                    <td className="py-3 pr-4">{comune.clusters_count}</td>
                    <td className="py-3 pr-4">{comune.actions_sent}</td>
                    <td className="py-3">{comune.responses_received}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
