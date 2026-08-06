import Link from 'next/link'
import type { Metadata } from 'next'
import { CalloutAvviso, CardIstituzionale, TagStato } from '@voce/ui'
import { CATEGORY_LABELS, type AdminClusterOverview } from '@voce/db'

import { IntestazionePagina } from '@/components/admin/shell/IntestazionePagina'
import { RiquadroVuoto } from '@/components/admin/shell/RiquadroVuoto'
import { CellaAdmin, TabellaAdmin } from '@/components/admin/shell/TabellaAdmin'
import { ConfermaAzione } from '@/components/admin/atti/ConfermaAzione'
import { EsitoAzione } from '@/components/admin/atti/EsitoAzione'
import { formattaData } from '@/components/admin/atti/Scadenza'
import { richiediAdmin } from '@/lib/auth/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import { logger } from '@/lib/utils/logger'
import { confermaSospetto, togliFlagRevisione } from './azioni'

/**
 * I gruppi, e la coda di quelli fermati per sospetto coordinamento (PLAN2 §5.2).
 *
 * IL LIMITE INVALICABILE, scritto qui perché è qui che si potrebbe tradire: si
 * valuta il GRUPPO, mai il cittadino. In questa pagina non esiste, e non deve
 * esistere, niente che assomigli a un giudizio su una persona — nessun elenco
 * di chi ha scritto, nessun punteggio di attendibilità. Chi scrive male o è
 * arrabbiato verrebbe pesato meno, cioè l'opposto della ragione per cui VOCE
 * esiste.
 *
 * E il flag non nasconde niente: le viste pubbliche non lo filtrano. Blocca la
 * generazione degli atti, che è dove il danno sarebbe reale — un atto costruito
 * su una campagna coordinata danneggia chi lo ha firmato in buona fede.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Gruppi',
  robots: { index: false, follow: false },
}

export default async function GruppiAdminPage({ searchParams }: PageProps<'/admin/gruppi'>) {
  await richiediAdmin()
  const parametri = await searchParams

  const sb = await createServerSupabase()

  const { data, error } = await sb
    .from('admin_clusters_overview')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(300)

  if (error) {
    logger.error('admin.gruppi.lettura_fallita', {
      codice: error.code,
      messaggio: error.message,
    })
  }

  const gruppi = (data ?? []) as AdminClusterOverview[]
  const inRevisione = gruppi.filter((gruppo) => gruppo.review_flag)
  const altri = gruppi.filter((gruppo) => !gruppo.review_flag)

  return (
    <>
      <IntestazionePagina
        titolo="Gruppi"
        descrizione="Un gruppo raccoglie segnalazioni diverse sullo stesso problema. Qui si decide quali possono generare atti."
        percorso={[{ etichetta: 'Gruppi' }]}
      />

      <EsitoAzione esito={parametri.esito} errore={parametri.errore} />

      <CalloutAvviso tono="info" titolo="Si valuta il gruppo, mai il cittadino" className="mb-8">
        Questa pagina non contiene giudizi su persone e non deve contenerne.
        Nessun punteggio di attendibilità, nessuna scheda di chi segnala. Si
        guarda come è nato un gruppo, non chi lo compone.
      </CalloutAvviso>

      {error && (
        <CalloutAvviso tono="errore" titolo="Elenco non disponibile" className="mb-8">
          Non siamo riusciti a leggere i gruppi. Ricarica la pagina fra qualche
          minuto.
        </CalloutAvviso>
      )}

      {/* ------------------------------------------------------------------
          La coda vera: i gruppi fermati da un sospetto di coordinamento.
          ------------------------------------------------------------------ */}
      <section aria-labelledby="da-rivedere">
        <h2 id="da-rivedere" className="text-h3">
          Da rivedere
        </h2>
        <p className="mt-2 max-w-3xl text-body text-ink-muted">
          Venti segnalazioni quasi identiche da venti account nuovi non sono un
          movimento: sono una campagna. Questi gruppi restano pubblici, ma non
          generano atti finché non decidi tu.
        </p>

        {inRevisione.length === 0 ? (
          <div className="mt-6">
            <RiquadroVuoto titolo="Nessun gruppo in revisione">
              <p>Tutti i gruppi possono generare atti.</p>
            </RiquadroVuoto>
          </div>
        ) : (
          <ul className="mt-6 flex flex-col gap-6">
            {inRevisione.map((gruppo) => (
              // L'ancora sta sul <li>: dopo la decisione il redirect riporta
              // sul gruppo appena rivisto, non in cima all'elenco.
              <li key={gruppo.id ?? ''} id={`gruppo-${gruppo.id}`}>
                <CardIstituzionale>
                  <div className="flex flex-wrap items-center gap-2">
                    {gruppo.status && <TagStato stato={gruppo.status} />}
                    <span className="text-small text-ink-muted">
                      {gruppo.category
                        ? (CATEGORY_LABELS[gruppo.category] ?? gruppo.category)
                        : 'categoria non indicata'}
                    </span>
                    {gruppo.is_synthetic && (
                      <span className="rounded-pill bg-warning-bg px-3 py-1 text-caption font-semibold text-warning">
                        Dati di prova
                      </span>
                    )}
                  </div>

                  <h3 className="mt-2 text-h4">
                    <Link
                      href={`/gruppi/${gruppo.id}`}
                      className="text-primary-600 underline underline-offset-2"
                    >
                      {gruppo.title ?? 'Gruppo senza titolo'}
                    </Link>
                  </h3>

                  <p className="mt-1 text-small text-ink-muted">
                    {gruppo.city ?? 'comune non indicato'}
                    {gruppo.neighborhood ? ` — ${gruppo.neighborhood}` : ''} ·{' '}
                    {gruppo.citizens_count ?? 0} cittadini · {gruppo.reports_count ?? 0}{' '}
                    segnalazioni · {gruppo.atti_totali ?? 0} atti
                  </p>

                  <div className="mt-4 rounded-card bg-warning-bg p-4">
                    <h4 className="text-small font-semibold text-ink">
                      Perché è stato fermato
                    </h4>
                    <p className="mt-1 text-body text-ink">
                      {gruppo.review_reason ?? 'Motivo non registrato.'}
                    </p>
                    <p className="mt-2 text-caption text-ink-muted">
                      È un sospetto statistico, non una prova. Va letto come tale.
                    </p>
                  </div>

                  {gruppo.reviewed_by && (
                    <p className="mt-3 text-small text-ink-muted">
                      Ultima revisione: {gruppo.reviewed_by} —{' '}
                      {formattaData(gruppo.reviewed_at)}
                    </p>
                  )}

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start">
                    <ConfermaAzione
                      azione={togliFlagRevisione}
                      campiNascosti={{ clusterId: gruppo.id ?? '' }}
                      etichetta="Togli il flag di revisione"
                      conferma="Confermo, togli il flag"
                      variante="primary"
                      domanda={
                        'Togliere il flag è ciò che sblocca la generazione degli atti. ' +
                        'Finché resta, il database rifiuta ogni nuovo atto su questo gruppo. ' +
                        'Il motivo del sospetto resta scritto, con il tuo nome e la data.'
                      }
                    />

                    <ConfermaAzione
                      azione={confermaSospetto}
                      campiNascosti={{ clusterId: gruppo.id ?? '' }}
                      etichetta="Conferma il sospetto"
                      conferma="Confermo il sospetto"
                      variante="danger"
                      domanda={
                        'Il gruppo continua a comparire in pubblico e le segnalazioni restano al loro posto. ' +
                        'Cambia una cosa sola: da qui non nascono atti. ' +
                        'Resta la tua firma sulla decisione, e si può tornare indietro.'
                      }
                    />
                  </div>
                </CardIstituzionale>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ------------------------------------------------------------------
          Tutti gli altri gruppi.
          ------------------------------------------------------------------ */}
      <section className="mt-14" aria-labelledby="tutti">
        <h2 id="tutti" className="text-h3">
          Tutti i gruppi
        </h2>

        {altri.length === 0 ? (
          <p className="mt-3 text-body text-ink-muted">Nessun altro gruppo.</p>
        ) : (
          <>
            <p className="mt-2 text-body">
              {altri.length} gruppi senza segnali di coordinamento.
            </p>
            <div className="mt-4">
              <TabellaAdmin
                didascalia="Gruppi: titolo, comune, stato, cittadini, segnalazioni, atti e visibilità pubblica."
                colonne={[
                  'Gruppo',
                  'Comune',
                  'Stato',
                  'Cittadini',
                  'Segnalazioni',
                  'Atti',
                  'Visibilità',
                ]}
              >
                {altri.map((gruppo) => (
                  <tr key={gruppo.id ?? ''}>
                    <CellaAdmin intestazione>
                      <Link
                        href={`/gruppi/${gruppo.id}`}
                        className="text-primary-600 underline underline-offset-2"
                      >
                        {gruppo.title ?? 'Gruppo senza titolo'}
                      </Link>
                      <span className="block text-caption font-normal text-ink-muted">
                        {gruppo.category
                          ? (CATEGORY_LABELS[gruppo.category] ?? gruppo.category)
                          : 'categoria non indicata'}
                      </span>
                      {gruppo.is_synthetic && (
                        <span className="mt-1 inline-block rounded-pill bg-warning-bg px-2 py-0.5 text-caption font-semibold text-warning">
                          Dati di prova
                        </span>
                      )}
                    </CellaAdmin>
                    <CellaAdmin>
                      {gruppo.city ?? '—'}
                      {gruppo.neighborhood && (
                        <span className="block text-caption text-ink-muted">
                          {gruppo.neighborhood}
                        </span>
                      )}
                    </CellaAdmin>
                    <CellaAdmin>
                      {gruppo.status ? <TagStato stato={gruppo.status} /> : '—'}
                    </CellaAdmin>
                    <CellaAdmin className="tabular-nums">
                      {gruppo.citizens_count ?? 0}
                    </CellaAdmin>
                    <CellaAdmin className="tabular-nums">
                      {gruppo.reports_count ?? 0}
                    </CellaAdmin>
                    <CellaAdmin className="tabular-nums">
                      {gruppo.atti_totali ?? 0}
                      {(gruppo.atti_bozza ?? 0) > 0 && (
                        <span className="block text-caption text-ink-muted">
                          {gruppo.atti_bozza} in bozza
                        </span>
                      )}
                    </CellaAdmin>
                    <CellaAdmin>
                      {gruppo.e_pubblico ? 'Pubblico' : 'Sotto la soglia'}
                      {!gruppo.e_pubblico && (
                        <span className="block text-caption text-ink-muted">
                          servono tre cittadini distinti
                        </span>
                      )}
                    </CellaAdmin>
                  </tr>
                ))}
              </TabellaAdmin>
            </div>
          </>
        )}
      </section>

      <h2 className="mt-12 text-h3">Come si legge questa pagina</h2>
      <ul className="mt-3 max-w-3xl list-disc space-y-2 pl-5 text-small text-ink-muted">
        <li>
          Un gruppo in revisione resta visibile al pubblico. Il flag blocca gli
          atti, non la voce dei cittadini.
        </li>
        <li>
          Togliere il flag è l&apos;unica cosa che sblocca la generazione degli
          atti su quel gruppo.
        </li>
        <li>
          I segnali di coordinamento riguardano il gruppo: quando sono nati gli
          account, quanto si somigliano i testi, a che ora sono arrivati.
        </li>
        <li>
          I gruppi sotto i tre cittadini distinti non compaiono in pubblico. In
          un gruppo piccolo, nominare il problema è nominare chi lo ha sollevato.
        </li>
      </ul>
    </>
  )
}
