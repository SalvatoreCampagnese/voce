import type { ReactNode } from 'react'
import Link from 'next/link'
import type { Metadata } from 'next'
import { Breadcrumb, CardIstituzionale } from '@voce/ui'
import { getStatisticheComuni } from '@/lib/queries/public'
import {
  SOGLIA_PERCENTUALE,
  getRisposteComuni,
  riepilogaRisposte,
} from '@/lib/queries/trasparenza'

export const revalidate = 60

export const metadata: Metadata = {
  title: 'Quadro pubblico',
  description:
    'Quante segnalazioni, quanti gruppi, quanti atti inviati e quante risposte ricevute, comune per comune.',
}

/** Formattazione italiana: separatore delle migliaia e virgola decimale. */
function giorni(valore: number): string {
  return valore.toLocaleString('it-IT', { maximumFractionDigits: 1 })
}

export default async function TrasparenzaPage() {
  // Due letture indipendenti, in parallelo: se la seconda vista non risponde,
  // la prima sezione della pagina resta comunque completa.
  const [comuni, risposte] = await Promise.all([getStatisticheComuni(), getRisposteComuni()])
  const riepilogo = riepilogaRisposte(risposte)

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

  const totaliMostrati: { etichetta: string; valore: ReactNode }[] = [
    { etichetta: 'cittadini', valore: totali.cittadini.toLocaleString('it-IT') },
    { etichetta: 'gruppi', valore: totali.gruppi.toLocaleString('it-IT') },
    { etichetta: 'atti inviati', valore: totali.inviati.toLocaleString('it-IT') },
    {
      etichetta: 'atti con risposta',
      valore:
        percentualeRisposte === null ? (
          <>
            <span aria-hidden="true">&mdash;</span>
            <span className="sr-only">dato non disponibile</span>
          </>
        ) : (
          `${percentualeRisposte}%`
        ),
    },
  ]

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
        {/* Dentro un <dl> possono stare solo <dt>, <dd> e <div> che li
            raggruppano. Il componente Numero rende un <div><span><span>: la
            lista di definizioni risultava vuota di termini e la coppia
            numero-etichetta non arrivava legata a chi ascolta la pagina.
            Qui la coppia è esplicita. L'aspetto non cambia: flex-col-reverse
            tiene il numero sopra e l'etichetta sotto, come prima. */}
        <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {totaliMostrati.map((voce) => (
            <div key={voce.etichetta} className="flex flex-col-reverse">
              <dt className="text-small text-ink-muted">{voce.etichetta}</dt>
              <dd className="text-h1 font-bold text-primary-700">{voce.valore}</dd>
            </div>
          ))}
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
          //
          // tabIndex={0} + role="region": un contenitore che scorre e non è
          // raggiungibile da tastiera nasconde le colonne di destra a chi non
          // usa il mouse. Il tabIndex lo mette nel giro di tabulazione e le
          // frecce lo fanno scorrere; il ruolo con nome dice a chi ascolta
          // dove è finito il focus (WCAG 2.1.1).
          <div
            className="mt-6 overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="Tabella dei comuni, scorrevole in orizzontale"
          >
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

      {/* ------------------------------------------------------------------
          Chi risponde e chi no (PLAN2 §6.2).

          Tre regole hanno deciso la forma di questa sezione.

          1. Contiamo solo le risposte confermate da una persona: lo fa già la
             vista. Dire in pubblico che un comune ha ignorato una richiesta a
             cui aveva risposto è un'accusa che nessuna rettifica ripara.
          2. Nessun colore porta informazione. Niente semafori, niente barre:
             solo numeri e parole, leggibili anche da chi non distingue i
             colori e da chi ascolta la pagina.
          3. Nessuna classifica. L'ordine è alfabetico, non per merito: se
             ordinassimo per quota di risposta staremmo già dando un giudizio
             al posto di chi legge.
          ------------------------------------------------------------------ */}
      <section className="mt-14" aria-labelledby="chi-risponde">
        <h2 id="chi-risponde" className="text-h3">
          Chi risponde e chi no
        </h2>
        <p className="mt-3 max-w-2xl text-body text-ink-muted">
          Un atto senza risposta resta una lettera. Qui vedi quante tornano
          indietro e quanto tempo passa.
        </p>

        {risposte.length === 0 ? (
          <CardIstituzionale className="mt-6">
            <p className="text-body text-ink-muted">
              Non c&apos;è ancora nessuna risposta confermata. Questa tabella
              compare quando arriva la prima.
            </p>
          </CardIstituzionale>
        ) : (
          <>
            {/* Riassunto in una frase: chi legge da telefono e non scorre la
                tabella in orizzontale ha comunque il numero principale. */}
            <p className="mt-6 text-body">
              In tutto {riepilogo.attiInviati.toLocaleString('it-IT')} atti inviati e{' '}
              {riepilogo.risposteConfermate.toLocaleString('it-IT')} risposte confermate
              {riepilogo.quotaRisposta === null ? '' : ` (${riepilogo.quotaRisposta}%)`}.
            </p>

            {/* La descrizione visibile sta FUORI dal contenitore che scorre:
                dentro, larga quanto la tabella, su un telefono resterebbe
                tagliata a metà riga. Il <caption> resta per chi usa uno
                screen reader e annuncia la stessa cosa. */}
            <p className="mt-2 text-small text-ink-muted">
              Atti inviati, risposte confermate ed esiti. In ordine alfabetico.
            </p>

            {/* overflow-x-auto: sul telefono scorre la tabella, non la pagina.
                Il testo resta alla dimensione normale: rimpicciolirlo per farlo
                stare nello schermo esclude chi ha bisogno di leggerlo.
                tabIndex={0} e role="region": vedi la tabella qui sopra. */}
            <div
              className="mt-4 overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label="Tabella delle risposte, scorrevole in orizzontale"
            >
              <table className="w-full min-w-[56rem] border-collapse text-body">
                <caption className="sr-only">
                  Atti inviati, risposte confermate, quota di risposta, tempo
                  medio ed esiti, comune per comune, in ordine alfabetico
                </caption>
                <thead>
                  <tr className="border-b-2 border-surface-strong text-left align-bottom">
                    <th scope="col" className="py-3 pr-4 font-semibold">Comune</th>
                    <th scope="col" className="py-3 pr-4 font-semibold">Atti inviati</th>
                    <th scope="col" className="py-3 pr-4 font-semibold">Risposte confermate</th>
                    <th scope="col" className="py-3 pr-4 font-semibold">Quota di risposta</th>
                    <th scope="col" className="py-3 pr-4 font-semibold">Tempo medio</th>
                    <th scope="col" className="py-3 pr-4 font-semibold">Accolte</th>
                    <th scope="col" className="py-3 pr-4 font-semibold">Respinte</th>
                    <th scope="col" className="py-3 pr-4 font-semibold">Interlocutorie</th>
                    <th scope="col" className="py-3 font-semibold">Irricevibili</th>
                  </tr>
                </thead>
                <tbody>
                  {risposte.map((riga) => (
                    <tr key={riga.citta} className="border-b border-surface-strong align-top">
                      <th scope="row" className="py-3 pr-4 text-left font-semibold text-ink">
                        {riga.citta}
                      </th>
                      <td className="py-3 pr-4 tabular-nums">{riga.attiInviati}</td>
                      <td className="py-3 pr-4 tabular-nums">{riga.risposteConfermate}</td>
                      <td className="py-3 pr-4 tabular-nums">
                        {riga.quotaRisposta === null ? (
                          <>
                            <span>
                              {riga.risposteConfermate} su {riga.attiInviati}
                            </span>
                            {/* Sotto la soglia la percentuale non si mostra, e
                                il motivo si scrive accanto al dato: una nota a
                                fondo pagina la legge solo chi la cerca. */}
                            <span className="block text-caption text-ink-muted">
                              troppo pochi atti per una percentuale
                            </span>
                          </>
                        ) : (
                          <>
                            <span>{riga.quotaRisposta}%</span>
                            <span className="block text-caption text-ink-muted">
                              {riga.risposteConfermate} su {riga.attiInviati}
                            </span>
                          </>
                        )}
                      </td>
                      <td className="py-3 pr-4 tabular-nums">
                        {riga.giorniMedi === null ? (
                          <>
                            <span aria-hidden="true">&mdash;</span>
                            <span className="sr-only">dato non disponibile</span>
                          </>
                        ) : (
                          `${giorni(riga.giorniMedi)} giorni`
                        )}
                      </td>
                      <td className="py-3 pr-4 tabular-nums">{riga.accolte}</td>
                      <td className="py-3 pr-4 tabular-nums">{riga.respinte}</td>
                      <td className="py-3 pr-4 tabular-nums">{riga.interlocutorie}</td>
                      <td className="py-3 tabular-nums">{riga.irricevibili}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="mt-8 text-h4">Come leggere questi numeri</h3>
            <ul className="mt-3 max-w-2xl list-disc space-y-2 pl-5 text-small text-ink-muted">
              <li>
                Contiamo solo le risposte lette e confermate da una persona.
                Nessuna classificazione automatica finisce qui.
              </li>
              <li>
                Il tempo medio va dalla data di invio alla prima risposta.
                Le risposte successive non lo cambiano.
              </li>
              <li>
                Sotto {SOGLIA_PERCENTUALE} atti inviati mostriamo i numeri e non
                la percentuale. Su pochi atti una percentuale inganna.
              </li>
              <li>
                L&apos;ordine è alfabetico. Questa tabella non è una classifica e
                non assegna giudizi.
              </li>
            </ul>

            <h3 className="mt-8 text-h4">Cosa significano gli esiti</h3>
            <dl className="mt-3 max-w-2xl space-y-2 text-small text-ink-muted">
              <div>
                <dt className="inline font-semibold text-ink">Accolta:</dt>{' '}
                <dd className="inline">l&apos;amministrazione ha dato quello che era stato chiesto.</dd>
              </div>
              <div>
                <dt className="inline font-semibold text-ink">Respinta:</dt>{' '}
                <dd className="inline">rifiuto motivato nel merito della richiesta.</dd>
              </div>
              <div>
                <dt className="inline font-semibold text-ink">Interlocutoria:</dt>{' '}
                <dd className="inline">risposta che non decide: rinvia, chiede altro, sospende.</dd>
              </div>
              <div>
                <dt className="inline font-semibold text-ink">Irricevibile:</dt>{' '}
                <dd className="inline">rifiuto per forma, competenza o termini scaduti.</dd>
              </div>
            </dl>
          </>
        )}
      </section>
    </>
  )
}
