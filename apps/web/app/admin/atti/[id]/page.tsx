import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import {
  BarraProgresso,
  Bottone,
  CalloutAvviso,
  CampoModulo,
  CardIstituzionale,
  TagStato,
} from '@voce/ui'
import {
  ACTION_KIND_LABELS,
  PA_RESPONSE_CLASS_LABELS,
  type ActionKind,
} from '@voce/db'

import { IntestazionePagina } from '@/components/admin/shell/IntestazionePagina'
import { ConfermaAzione } from '@/components/admin/atti/ConfermaAzione'
import { CorpoAtto } from '@/components/admin/atti/CorpoAtto'
import { EsitoAzione } from '@/components/admin/atti/EsitoAzione'
import { Scadenza, formattaData } from '@/components/admin/atti/Scadenza'
import { richiediAdmin } from '@/lib/auth/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import { getSegnalazioniDelGruppo } from '@/lib/queries/public'
import { logger } from '@/lib/utils/logger'
import {
  apriRaccoltaFirme,
  archiviaAtto,
  correggiTesto,
  revisionaEPubblica,
  segnaComeInviato,
} from '../azioni'

/**
 * La revisione di un singolo atto.
 *
 * Il gesto che conta è uno: la firma con cui una persona rende pubblico un
 * testo scritto da un modello. Tutto il resto della pagina esiste per rendere
 * quel gesto informato — il corpo per intero, il gruppo da cui nasce, le
 * segnalazioni citate, e la frase che dice cosa succede premendo.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Revisione di un atto',
  robots: { index: false, follow: false },
}

export default async function AttoAdminPage({
  params,
  searchParams,
}: PageProps<'/admin/atti/[id]'>) {
  const admin = await richiediAdmin()
  const { id } = await params
  const parametri = await searchParams

  const sb = await createServerSupabase()

  const { data: atto, error } = await sb
    .from('actions')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    logger.error('admin.atto.lettura_fallita', {
      action_id: id,
      codice: error.code,
      messaggio: error.message,
    })
  }

  if (!atto) notFound()

  // Il gruppo di origine: contatori e stato di revisione. Non contiene testi di
  // segnalazione né identità, per costruzione dello schema.
  const { data: gruppo } = await sb
    .from('clusters')
    .select(
      'id, title, city, neighborhood, status, citizens_count, reports_count, review_flag, review_reason',
    )
    .eq('id', atto.cluster_id)
    .maybeSingle()

  // Le segnalazioni citate arrivano dalla vista pubblica, che espone SOLO
  // `anon_text`. Il testo grezzo di un cittadino non entra in questa pagina e
  // non deve: chi revisiona un atto non ha bisogno di sapere chi ha scritto, e
  // la RLS glielo impedisce comunque fuori dalla coda di moderazione.
  const segnalazioni = await getSegnalazioniDelGruppo(atto.cluster_id)

  // Solo i metadati delle risposte: il testo integrale si legge in
  // /admin/risposte, dove c'è il contesto per capirlo.
  const { data: risposte } = await sb
    .from('action_responses')
    .select('id, classification, confirmed_by, received_at')
    .eq('action_id', id)
    .order('received_at', { ascending: false })

  const revisionato = Boolean(atto.reviewed_by)
  const tipo = ACTION_KIND_LABELS[atto.kind as ActionKind] ?? atto.kind

  return (
    <>
      <IntestazionePagina
        titolo={atto.title}
        percorso={[{ etichetta: 'Atti', href: '/admin/atti' }, { etichetta: atto.title }]}
      />

      <EsitoAzione esito={parametri.esito} errore={parametri.errore} />

      <div className="mb-8 flex flex-wrap items-center gap-2">
        <TagStato stato={atto.status} />
        <span className="text-small text-ink-muted">{tipo}</span>
        {atto.is_synthetic && (
          <span className="rounded-pill bg-warning-bg px-3 py-1 text-caption font-semibold text-warning">
            Dati di prova — non revisionare
          </span>
        )}
      </div>

      <div className="grid gap-10 lg:grid-cols-[2fr_1fr]">
        <div>
          <CorpoAtto bodyMarkdown={atto.body_markdown} reviewedBy={atto.reviewed_by} />

          {/* ---------------------------------------------------------------
              Correzione del testo.
              Sta subito sotto il corpo perché è lì che nasce il bisogno: si
              legge una riga sbagliata e la si vuole aggiustare adesso.
              --------------------------------------------------------------- */}
          <details className="mt-8 rounded-card border border-surface-strong bg-white">
            <summary className="flex min-h-11 cursor-pointer select-none items-center px-4 py-3 text-body font-semibold text-ink">
              Correggi il testo
            </summary>
            <div className="border-t border-surface-strong px-4 py-4">
              <p className="max-w-2xl text-body text-ink-muted">
                Qui si correggono gli errori della macchina: norme citate male,
                fatti gonfiati, dettagli inventati. Le parole dei cittadini
                restano loro e non passano da questo campo.
              </p>
              <form action={correggiTesto} className="mt-4">
                <input type="hidden" name="id" value={atto.id} />
                <CampoModulo
                  id="bodyMarkdown"
                  etichetta="Testo dell’atto"
                  aiuto="Formato Markdown, lo stesso che vedi impaginato qui sopra."
                  obbligatorio
                >
                  {(attributi) => (
                    <textarea
                      {...attributi}
                      name="bodyMarkdown"
                      rows={24}
                      required
                      minLength={50}
                      defaultValue={atto.body_markdown ?? ''}
                      className={`${attributi.className} font-mono text-small`}
                    />
                  )}
                </CampoModulo>
                <Bottone type="submit" variante="secondary" className="mt-4">
                  Salva il testo
                </Bottone>
              </form>
            </div>
          </details>

          {/* ---------------------------------------------------------------
              Le segnalazioni su cui l'atto è costruito.
              --------------------------------------------------------------- */}
          <section className="mt-12" aria-labelledby="segnalazioni">
            <h2 id="segnalazioni" className="text-h3">
              Segnalazioni citate
            </h2>
            <p className="mt-2 max-w-2xl text-body text-ink-muted">
              Sono i racconti già anonimizzati. Il testo originale non entra in
              questa pagina e non entra in un atto.
            </p>

            {segnalazioni.length === 0 ? (
              <CardIstituzionale className="mt-4">
                <p className="text-body text-ink-muted">
                  Nessuna segnalazione visibile. Succede quando il gruppo è sotto
                  la soglia dei tre cittadini distinti.
                </p>
              </CardIstituzionale>
            ) : (
              <ul className="mt-4 flex flex-col gap-3">
                {segnalazioni.map((segnalazione) => (
                  <li key={segnalazione.id ?? ''}>
                    <CardIstituzionale className="p-4">
                      <p className="text-body text-ink">{segnalazione.anon_text}</p>
                      <p className="mt-2 text-caption text-ink-muted">
                        {formattaData(segnalazione.created_at)}
                      </p>
                    </CardIstituzionale>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* -----------------------------------------------------------------
            Colonna delle decisioni.
            ----------------------------------------------------------------- */}
        <aside className="flex flex-col gap-6">
          <CardIstituzionale>
            <h2 className="text-h4">Scheda</h2>
            <dl className="mt-4 flex flex-col gap-3 text-body">
              <div>
                <dt className="text-small font-semibold text-ink-muted">Destinatario</dt>
                <dd>{atto.recipient ?? 'da definire'}</dd>
              </div>
              <div>
                <dt className="text-small font-semibold text-ink-muted">Gruppo di origine</dt>
                <dd>
                  {gruppo ? (
                    <>
                      <Link
                        href={`/gruppi/${gruppo.id}`}
                        className="font-semibold text-primary-600 underline underline-offset-2"
                      >
                        {gruppo.title}
                      </Link>
                      <span className="block text-small text-ink-muted">
                        {gruppo.citizens_count} cittadini, {gruppo.reports_count}{' '}
                        segnalazioni
                        {gruppo.city ? ` — ${gruppo.city}` : ''}
                      </span>
                    </>
                  ) : (
                    'non disponibile'
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-small font-semibold text-ink-muted">Inviato il</dt>
                <dd>{formattaData(atto.submitted_at)}</dd>
              </div>
              <div>
                <dt className="text-small font-semibold text-ink-muted">Termine di legge</dt>
                <dd>
                  <Scadenza deadlineAt={atto.deadline_at} deadlineBasis={atto.deadline_basis} />
                </dd>
              </div>
              <div>
                <dt className="text-small font-semibold text-ink-muted">Revisione</dt>
                <dd>
                  {revisionato
                    ? `${atto.reviewed_by} — ${formattaData(atto.reviewed_at)}`
                    : 'nessuna, il testo non è pubblico'}
                </dd>
              </div>
            </dl>

            <BarraProgresso
              className="mt-6"
              valore={atto.signatures_count}
              obiettivo={atto.signatures_target}
            />
          </CardIstituzionale>

          {gruppo?.review_flag && (
            <CalloutAvviso tono="attenzione" titolo="Gruppo sotto revisione">
              Il gruppo è fermo per sospetto coordinamento:{' '}
              {gruppo.review_reason ?? 'motivo non registrato'}. Finché resta
              così non nascono nuovi atti. Si valuta il gruppo, mai il cittadino.
            </CalloutAvviso>
          )}

          <section aria-labelledby="decisioni" className="flex flex-col gap-3">
            <h2 id="decisioni" className="text-h4">
              Cosa puoi fare
            </h2>

            <ConfermaAzione
              azione={revisionaEPubblica}
              campiNascosti={{ id: atto.id }}
              etichetta="Revisiona e pubblica il testo"
              conferma="Confermo, pubblica il testo"
              variante="primary"
              disabilitata={revisionato}
              motivoDisabilitata={
                revisionato
                  ? `Già revisionato da ${atto.reviewed_by}. Il testo è pubblico.`
                  : undefined
              }
              domanda={
                `Il corpo di questo atto diventa pubblico e indicizzabile. ` +
                `Accanto sarà visibile il tuo nome: ${admin.fullName}. ` +
                `Prima rileggilo per intero: cerca nomi, indirizzi civici, targhe e dati sanitari. ` +
                `Un esposto con la condizione clinica di un minore è già finito online senza controllo.`
              }
            />

            <ConfermaAzione
              azione={apriRaccoltaFirme}
              campiNascosti={{ id: atto.id }}
              etichetta="Apri la raccolta firme"
              conferma="Apri la raccolta firme"
              variante="secondary"
              disabilitata={atto.status !== 'bozza'}
              motivoDisabilitata={
                atto.status !== 'bozza' ? 'Si può fare solo su un atto in bozza.' : undefined
              }
              domanda="L’atto passa in raccolta firme. Non parte: resta fermo finché non lo segni come inviato."
            />

            <ConfermaAzione
              azione={segnaComeInviato}
              campiNascosti={{ id: atto.id }}
              etichetta="Segna come inviato"
              conferma="Confermo, l’atto è partito"
              variante="primary"
              disabilitata={atto.status !== 'in_firma' || !revisionato}
              motivoDisabilitata={
                !revisionato
                  ? 'Prima revisiona il testo: il database rifiuta l’invio senza firma.'
                  : atto.status !== 'in_firma'
                    ? 'Si può fare solo su un atto in raccolta firme.'
                    : undefined
              }
              domanda={
                'Registra che l’atto è stato consegnato all’amministrazione. ' +
                'VOCE non lo spedisce: lo spedisci tu, fuori da qui. ' +
                'Da adesso parte il conteggio dei giorni previsti dalla legge per la risposta.'
              }
            />

            <ConfermaAzione
              azione={archiviaAtto}
              campiNascosti={{ id: atto.id }}
              etichetta="Archivia l’atto"
              conferma="Archivia"
              variante="danger"
              disabilitata={atto.status === 'archiviata'}
              motivoDisabilitata={
                atto.status === 'archiviata' ? 'È già archiviato.' : undefined
              }
              domanda="L’atto resta consultabile ma esce dalla coda. Usalo quando è superato o sostituito da un altro."
            />
          </section>

          <CardIstituzionale>
            <h2 className="text-h4">Risposte ricevute</h2>
            {!risposte || risposte.length === 0 ? (
              <p className="mt-3 text-body text-ink-muted">
                Nessuna risposta registrata per questo atto.
              </p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2 text-body">
                {risposte.map((risposta) => (
                  <li key={risposta.id}>
                    {formattaData(risposta.received_at)} —{' '}
                    {risposta.classification
                      ? PA_RESPONSE_CLASS_LABELS[risposta.classification]
                      : 'non ancora classificata'}
                    <span className="block text-caption text-ink-muted">
                      {risposta.confirmed_by
                        ? `confermata da ${risposta.confirmed_by}`
                        : 'da confermare, non è pubblica'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/admin/risposte"
              className="mt-4 inline-block text-body font-semibold text-primary-600 underline underline-offset-4"
            >
              Vai alle risposte della PA
            </Link>
          </CardIstituzionale>
        </aside>
      </div>
    </>
  )
}
