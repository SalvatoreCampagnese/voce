import Link from 'next/link'
import type { Metadata } from 'next'
import { Bottone, CalloutAvviso, CampoModulo, CardIstituzionale } from '@voce/ui'
import {
  ACTION_KIND_LABELS,
  PA_RESPONSE_CLASS_LABELS,
  type ActionKind,
  type ActionResponse,
  type AdminActionQueueItem,
  type PaResponseClass,
} from '@voce/db'

import { IntestazionePagina } from '@/components/admin/shell/IntestazionePagina'
import { RiquadroVuoto } from '@/components/admin/shell/RiquadroVuoto'
import { CellaAdmin, TabellaAdmin } from '@/components/admin/shell/TabellaAdmin'
import { ConfermaAzione } from '@/components/admin/atti/ConfermaAzione'
import { EsitoAzione } from '@/components/admin/atti/EsitoAzione'
import { formattaData } from '@/components/admin/atti/Scadenza'
import { richiediAdmin } from '@/lib/auth/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import { logger } from '@/lib/utils/logger'
import { confermaRisposta, correggiClassificazione, registraRisposta } from './azioni'

/**
 * Le risposte della pubblica amministrazione (PLAN2 §3.2).
 *
 * Una classificazione sbagliata fa dichiarare pubblicamente che un comune ha
 * ignorato una richiesta a cui invece ha risposto. È un'accusa falsa a
 * un'istituzione, firmata da cittadini che non l'hanno controllata, ed è il
 * tipo di errore che brucia la credibilità di VOCE in un pomeriggio.
 *
 * Per questo la pagina è costruita attorno a un solo passaggio: il modello
 * propone, una persona conferma, e solo la conferma rende pubblico.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Risposte della PA',
  robots: { index: false, follow: false },
}

const CLASSI: PaResponseClass[] = ['accolta', 'respinta', 'interlocutoria', 'irricevibile']

export default async function RispostePage({ searchParams }: PageProps<'/admin/risposte'>) {
  await richiediAdmin()
  const parametri = await searchParams

  const sb = await createServerSupabase()

  // Tre letture indipendenti: se una fallisce, il resto della pagina resta
  // utilizzabile. Chi ha in mano il PDF di una risposta deve poterlo incollare
  // anche se la coda non si carica.
  const [codaResult, confermateResult, attiResult] = await Promise.all([
    sb
      .from('action_responses')
      .select('*')
      .is('confirmed_by', null)
      .order('received_at', { ascending: true })
      .limit(100),
    sb
      .from('action_responses')
      .select('*')
      .not('confirmed_by', 'is', null)
      .order('confirmed_at', { ascending: false })
      .limit(20),
    sb
      .from('admin_actions_queue')
      .select('*')
      .in('status', ['inviata', 'risposta_ricevuta'])
      .order('submitted_at', { ascending: false })
      .limit(200),
  ])

  for (const [blocco, risultato] of [
    ['coda', codaResult],
    ['confermate', confermateResult],
    ['atti', attiResult],
  ] as const) {
    if (risultato.error) {
      logger.error('admin.risposte.lettura_fallita', {
        blocco,
        codice: risultato.error.code,
        messaggio: risultato.error.message,
      })
    }
  }

  const coda = (codaResult.data ?? []) as ActionResponse[]
  const confermate = (confermateResult.data ?? []) as ActionResponse[]
  const attiInviati = (attiResult.data ?? []) as AdminActionQueueItem[]

  // Un atto citato da una risposta può essere fuori dall'elenco qui sopra —
  // archiviato, per esempio. Si recupera a parte, così nessuna riga della coda
  // resta senza titolo e senza contesto.
  const idCitati = [...new Set([...coda, ...confermate].map((r) => r.action_id))].filter(
    (id) => !attiInviati.some((atto) => atto.id === id),
  )

  let attiCitati: AdminActionQueueItem[] = []
  if (idCitati.length > 0) {
    const { data } = await sb.from('admin_actions_queue').select('*').in('id', idCitati)
    attiCitati = (data ?? []) as AdminActionQueueItem[]
  }

  const mappaAtti = new Map<string, AdminActionQueueItem>()
  for (const atto of [...attiInviati, ...attiCitati]) {
    if (atto.id) mappaAtti.set(atto.id, atto)
  }

  return (
    <>
      <IntestazionePagina
        titolo="Risposte della pubblica amministrazione"
        descrizione="Qui si legge cosa ha risposto un’amministrazione e si decide come classificarlo. Il testo della risposta resta privato."
        percorso={[{ etichetta: 'Risposte' }]}
      />

      <EsitoAzione esito={parametri.esito} errore={parametri.errore} />

      <CalloutAvviso tono="attenzione" titolo="Perché serve la tua conferma" className="mb-8">
        Una classificazione sbagliata fa dichiarare che un comune ha ignorato una
        richiesta a cui invece ha risposto. Il modello propone, tu confermi.
        Nulla diventa pubblico prima della conferma.
      </CalloutAvviso>

      {/* ------------------------------------------------------------------
          Registrare una risposta arrivata.
          ------------------------------------------------------------------ */}
      <details className="mb-10 rounded-card border border-surface-strong bg-white">
        <summary className="flex min-h-11 cursor-pointer select-none items-center px-4 py-3 text-body font-semibold text-ink">
          Registra una risposta arrivata
        </summary>
        <div className="border-t border-surface-strong px-4 py-4">
          {attiInviati.length === 0 ? (
            <p className="text-body text-ink-muted">
              Nessun atto risulta inviato. Una risposta si registra solo su un
              atto già partito.
            </p>
          ) : (
            <form action={registraRisposta} className="flex max-w-2xl flex-col gap-5">
              <CampoModulo
                id="actionId"
                etichetta="A quale atto risponde"
                aiuto="Compaiono solo gli atti già inviati."
                obbligatorio
              >
                {(attributi) => (
                  // `required` sul controllo e non solo `aria-required`: la
                  // validazione nativa del browser non è JavaScript e continua
                  // a funzionare quando lo script non carica.
                  <select {...attributi} name="actionId" defaultValue="" required>
                    <option value="" disabled>
                      Scegli un atto
                    </option>
                    {attiInviati.map((atto) => (
                      <option key={atto.id ?? ''} value={atto.id ?? ''}>
                        {atto.title} — {atto.city ?? 'comune non indicato'}
                      </option>
                    ))}
                  </select>
                )}
              </CampoModulo>

              <CampoModulo
                id="fonte"
                etichetta="Come è arrivata"
                aiuto="Serve a ricostruire il percorso del documento."
              >
                {(attributi) => (
                  <select {...attributi} name="fonte" defaultValue="manuale">
                    <option value="manuale">Consegnata a mano o caricata</option>
                    <option value="pec">Posta elettronica certificata</option>
                    <option value="email">Posta elettronica ordinaria</option>
                  </select>
                )}
              </CampoModulo>

              <CampoModulo
                id="testo"
                etichetta="Testo della risposta"
                aiuto="Incollalo per intero. Resta privato: non compare in nessuna pagina pubblica."
                obbligatorio
              >
                {(attributi) => (
                  <textarea {...attributi} name="testo" rows={12} required minLength={30} />
                )}
              </CampoModulo>

              <Bottone type="submit" className="self-start">
                Salva e fai leggere la risposta
              </Bottone>
            </form>
          )}
        </div>
      </details>

      {/* ------------------------------------------------------------------
          La coda: risposte da confermare.
          ------------------------------------------------------------------ */}
      <section aria-labelledby="da-confermare">
        <h2 id="da-confermare" className="text-h3">
          Da confermare
        </h2>

        {coda.length === 0 ? (
          <div className="mt-4">
            <RiquadroVuoto titolo="Nessuna risposta in attesa">
              <p>
                Le risposte compaiono qui appena vengono registrate. Nessuna resta
                indietro senza che tu la veda.
              </p>
            </RiquadroVuoto>
          </div>
        ) : (
          <>
            <p className="mt-2 text-body">
              {coda.length} risposte aspettano una conferma.
            </p>

            <ul className="mt-6 flex flex-col gap-6">
              {coda.map((risposta) => {
                const atto = mappaAtti.get(risposta.action_id)
                const idClasse = `classificazione-${risposta.id}`
                const idArt = `art5bis-${risposta.id}`

                return (
                  // L'ancora sta sul <li>: dopo un salvataggio il redirect
                  // riporta esattamente alla riga su cui si stava lavorando,
                  // che in una coda di venti risposte è la differenza fra
                  // proseguire e ricominciare.
                  <li key={risposta.id} id={`risposta-${risposta.id}`}>
                    <CardIstituzionale>
                      <h3 className="text-h4">
                        {atto ? (
                          <Link
                            href={`/admin/atti/${risposta.action_id}`}
                            className="text-primary-600 underline underline-offset-2"
                          >
                            {atto.title}
                          </Link>
                        ) : (
                          'Atto non disponibile'
                        )}
                      </h3>
                      <p className="mt-1 text-small text-ink-muted">
                        {atto?.kind
                          ? (ACTION_KIND_LABELS[atto.kind as ActionKind] ?? atto.kind)
                          : 'tipo non indicato'}
                        {atto?.city ? ` — ${atto.city}` : ''} · ricevuta il{' '}
                        {formattaData(risposta.received_at)} · fonte: {risposta.source}
                      </p>

                      {/* Quello che il modello ha capito. Privato: è una
                          riscrittura di raw_text e può portarsi dietro il nome
                          di un funzionario o un numero di protocollo. */}
                      <dl className="mt-4 flex flex-col gap-3 text-body">
                        <div>
                          <dt className="text-small font-semibold text-ink-muted">
                            Classificazione proposta dal modello
                          </dt>
                          <dd>
                            {risposta.classification
                              ? PA_RESPONSE_CLASS_LABELS[risposta.classification]
                              : 'nessuna: la lettura automatica non è andata a buon fine'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-small font-semibold text-ink-muted">
                            Motivo estratto (privato)
                          </dt>
                          <dd>{risposta.reason ?? 'non estratto'}</dd>
                        </div>
                        <div>
                          <dt className="text-small font-semibold text-ink-muted">
                            Cita l’art. 5-bis del D.Lgs. 33/2013
                          </dt>
                          <dd>{risposta.cites_art_5bis ? 'sì' : 'no'}</dd>
                        </div>
                        <div>
                          <dt className="text-small font-semibold text-ink-muted">
                            Rimedio proposto (privato)
                          </dt>
                          <dd>{risposta.proposed_remedy ?? 'nessuno'}</dd>
                        </div>
                      </dl>

                      {/* Cosa vedrà davvero il pubblico: le colonne
                          anonimizzate, che sono altra cosa dal motivo grezzo
                          qui sopra. */}
                      <div className="mt-4 rounded-card bg-surface-alt p-4">
                        <h4 className="text-small font-semibold text-ink">
                          Cosa diventerà pubblico
                        </h4>
                        {risposta.reason_anon || risposta.proposed_remedy_anon ? (
                          <dl className="mt-2 flex flex-col gap-2 text-small text-ink-muted">
                            <div>
                              <dt className="font-semibold text-ink">Motivo</dt>
                              <dd>{risposta.reason_anon ?? 'nessuno'}</dd>
                            </div>
                            <div>
                              <dt className="font-semibold text-ink">Rimedio</dt>
                              <dd>{risposta.proposed_remedy_anon ?? 'nessuno'}</dd>
                            </div>
                          </dl>
                        ) : (
                          <p className="mt-2 text-small text-ink-muted">
                            L’anonimizzazione non è ancora passata. In pagina
                            compariranno la classificazione e nessun testo:
                            meglio una riga senza motivo che il nome di una
                            persona online.
                          </p>
                        )}
                      </div>

                      {/* Il testo integrale, chiuso di proposito: si apre
                          quando serve leggerlo, non ogni volta che si scorre
                          la coda. */}
                      <details className="mt-4">
                        <summary className="flex min-h-11 cursor-pointer select-none items-center text-body font-semibold text-primary-600">
                          Mostra il testo della risposta
                        </summary>
                        <p className="mt-2 whitespace-pre-wrap rounded-card border border-surface-strong p-4 text-small text-ink">
                          {risposta.raw_text}
                        </p>
                        <p className="mt-2 text-caption text-ink-muted">
                          Testo privato. Non compare in nessuna pagina pubblica
                          né dentro un atto.
                        </p>
                      </details>

                      {/* Correzione della classificazione. */}
                      <form
                        action={correggiClassificazione}
                        className="mt-6 flex flex-col gap-4 border-t border-surface-strong pt-6"
                      >
                        <input type="hidden" name="responseId" value={risposta.id} />

                        <CampoModulo
                          id={idClasse}
                          etichetta="Come è andata davvero"
                          aiuto="Correggi il modello se ha capito male. Resta privato finché non confermi."
                          obbligatorio
                        >
                          {(attributi) => (
                            <select
                              {...attributi}
                              name="classificazione"
                              defaultValue={risposta.classification ?? ''}
                              required
                            >
                              <option value="" disabled>
                                Scegli una classificazione
                              </option>
                              {CLASSI.map((classe) => (
                                <option key={classe} value={classe}>
                                  {PA_RESPONSE_CLASS_LABELS[classe]}
                                </option>
                              ))}
                            </select>
                          )}
                        </CampoModulo>

                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            id={idArt}
                            name="citaArt5bis"
                            value="si"
                            defaultChecked={risposta.cites_art_5bis}
                            className="h-6 w-6 rounded border-2 border-border-control"
                          />
                          <label htmlFor={idArt} className="text-body text-ink">
                            La risposta invoca un’esclusione dell’art. 5-bis
                          </label>
                        </div>

                        <Bottone type="submit" variante="secondary" className="self-start">
                          Aggiorna la classificazione
                        </Bottone>
                      </form>

                      <div className="mt-4">
                        <ConfermaAzione
                          azione={confermaRisposta}
                          campiNascosti={{ responseId: risposta.id }}
                          etichetta="Conferma la classificazione"
                          conferma="Confermo, è corretta"
                          variante="primary"
                          disabilitata={!risposta.classification}
                          motivoDisabilitata={
                            risposta.classification
                              ? undefined
                              : 'Scegli e salva una classificazione prima di confermare.'
                          }
                          domanda={
                            'Stai confermando l’esito, non la pubblicabilità del testo. ' +
                            'La risposta entra nel quadro pubblico e nei conteggi per comune. ' +
                            'Rileggi il testo integrale prima di premere.'
                          }
                        />
                      </div>
                    </CardIstituzionale>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </section>

      {/* ------------------------------------------------------------------
          Storico: le risposte già confermate.
          ------------------------------------------------------------------ */}
      <section className="mt-14" aria-labelledby="confermate">
        <h2 id="confermate" className="text-h3">
          Già confermate
        </h2>

        {confermate.length === 0 ? (
          <p className="mt-3 text-body text-ink-muted">
            Nessuna risposta confermata finora.
          </p>
        ) : (
          <div className="mt-4">
            <TabellaAdmin
              didascalia="Risposte già confermate: atto, esito, data di ricezione e persona che ha confermato."
              colonne={['Atto', 'Esito', 'Ricevuta', 'Confermata da']}
            >
              {confermate.map((risposta) => (
                <tr key={risposta.id}>
                  <CellaAdmin intestazione>
                    <Link
                      href={`/admin/atti/${risposta.action_id}`}
                      className="text-primary-600 underline underline-offset-2"
                    >
                      {mappaAtti.get(risposta.action_id)?.title ?? 'Atto'}
                    </Link>
                  </CellaAdmin>
                  <CellaAdmin>
                    {risposta.classification
                      ? PA_RESPONSE_CLASS_LABELS[risposta.classification]
                      : '—'}
                    {risposta.cites_art_5bis && (
                      <span className="block text-caption text-ink-muted">
                        cita l’art. 5-bis
                      </span>
                    )}
                  </CellaAdmin>
                  <CellaAdmin>{formattaData(risposta.received_at)}</CellaAdmin>
                  <CellaAdmin>
                    {risposta.confirmed_by}
                    <span className="block text-caption text-ink-muted">
                      {formattaData(risposta.confirmed_at)}
                    </span>
                  </CellaAdmin>
                </tr>
              ))}
            </TabellaAdmin>
          </div>
        )}
      </section>
    </>
  )
}
