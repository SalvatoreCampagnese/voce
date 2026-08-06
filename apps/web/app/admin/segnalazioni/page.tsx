import type { Metadata } from 'next'
import Link from 'next/link'
import { CalloutAvviso, CardIstituzionale } from '@voce/ui'
import { MEDIA_KIND_LABELS } from '@voce/db'

import { AzioneConConferma } from '@/components/admin/shell/AzioneConConferma'
import { IntestazionePagina } from '@/components/admin/shell/IntestazionePagina'
import { RiquadroVuoto } from '@/components/admin/shell/RiquadroVuoto'
import { richiediAdmin } from '@/lib/auth/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import { logger } from '@/lib/utils/logger'
import { confermaQuarantena, riammettiSegnalazione } from './azioni'

/**
 * La coda della moderazione (PLAN2 §1.3).
 *
 * PERCHÉ QUI SI VEDE `raw_text` E ALTROVE NO. La policy RLS lascia leggere il
 * testo grezzo **solo** per le segnalazioni in quarantena, segnalate, o già
 * riviste da un amministratore. Non è una limitazione da aggirare: `raw_text`
 * può contenere nomi, indirizzi, condizioni di salute, il racconto di una
 * violenza, e un pannello che mostra tutto trasforma un ruolo di servizio in
 * una sorveglianza sul quartiere che dovrebbe difendere. Se una query torna
 * vuota, è la policy che funziona.
 *
 * I MEDIA NON SI APRONO. Di un vocale si legge la trascrizione, di una foto la
 * descrizione: sono già il contenuto su cui il sistema lavora, e bastano a
 * decidere. Un vocale è un dato biometrico ai sensi dell'art. 9 GDPR — la voce
 * identifica chi parla anche senza nome — e una foto scattata in strada
 * contiene volti di passanti che non hanno mai scritto a VOCE. Il giorno in cui
 * ascoltare un audio fosse davvero indispensabile per decidere, l'unica forma
 * accettabile sarebbe una URL firmata generata sul server, valida pochi minuti
 * e con il motivo registrato: mai un collegamento permanente, mai un file
 * servito dalla pagina.
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Segnalazioni in quarantena',
  robots: { index: false, follow: false },
}

/** Quante righe si guardano in un giro. Oltre non è una coda, è un archivio. */
const LIMITE = 50

/**
 * Le categorie arrivano in inglese dal classificatore di OpenAI. Qui si
 * traducono: chi modera deve capire perché è scattato, non indovinarlo.
 */
const CATEGORIE_MODERAZIONE: Record<string, string> = {
  harassment: 'molestie',
  'harassment/threatening': 'molestie con minaccia',
  hate: 'odio',
  'hate/threatening': 'odio con minaccia',
  illicit: 'attività illecite',
  'illicit/violent': 'attività illecite violente',
  'self-harm': 'autolesionismo',
  'self-harm/intent': 'intenzione di autolesionismo',
  'self-harm/instructions': 'istruzioni per autolesionismo',
  sexual: 'contenuto sessuale',
  'sexual/minors': 'contenuto sessuale su minori',
  violence: 'violenza',
  'violence/graphic': 'violenza esplicita',
}

const CANALI: Record<string, string> = {
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  web: 'Modulo sul sito',
  voice: 'Messaggio vocale',
}

const ESITI: Record<string, { tono: 'successo' | 'errore'; titolo: string; testo: string }> = {
  riammessa: {
    tono: 'successo',
    titolo: 'Riammessa',
    testo: 'La segnalazione torna in circolo. Il triage la riprende entro poco.',
  },
  confermata: {
    tono: 'successo',
    titolo: 'Quarantena confermata',
    testo: 'Resta fuori dai gruppi e dagli atti. La decisione è registrata a tuo nome.',
  },
  errore: {
    tono: 'errore',
    titolo: 'Non è andata',
    testo: 'La decisione non è stata salvata. Riprova: nulla è cambiato.',
  },
}

function categorieDi(valore: unknown): string[] {
  if (!Array.isArray(valore)) return []
  return valore
    .filter((v): v is string => typeof v === 'string')
    .map((v) => CATEGORIE_MODERAZIONE[v] ?? v)
}

function dataLunga(valore: string): string {
  return new Date(valore).toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function SegnalazioniPage({
  searchParams,
}: PageProps<'/admin/segnalazioni'>) {
  await richiediAdmin()

  const parametri = await searchParams
  const stato = parametri.stato === 'riviste' ? 'riviste' : 'da-rivedere'
  const esito = typeof parametri.esito === 'string' ? ESITI[parametri.esito] : undefined

  const sb = await createServerSupabase()

  // Una stringa sola e non una concatenazione: supabase-js ricava i tipi delle
  // righe dal LETTERALE passato a `select`. Spezzarlo con `+` fa collassare il
  // tipo a `string` e le colonne diventano `any` senza che nulla lo segnali.
  const selezione =
    'id, created_at, channel, status, raw_text, clean_text, city, neighborhood, moderation_categories, moderation_score, moderated_at, moderation_flagged, moderation_reviewed_by, moderation_reviewed_at, previous_cluster_id, report_media(id, kind, transcript, description, duration_seconds)'

  // Due code diverse, due filtri diversi. Le riviste possono essere uscite
  // dalla quarantena — dopo un «riammetti» lo stato torna 'nuovo' — quindi il
  // filtro sullo stato qui non si applica: le tiene visibili la firma.
  const query =
    stato === 'da-rivedere'
      ? sb
          .from('reports')
          .select(selezione)
          .or('status.eq.quarantena,moderation_flagged.is.true')
          .is('moderation_reviewed_by', null)
      : sb.from('reports').select(selezione).not('moderation_reviewed_by', 'is', null)

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(LIMITE)

  if (error) {
    logger.error('admin.segnalazioni.lettura_fallita', { error, stato })
  }

  const segnalazioni = data ?? []

  return (
    <>
      <IntestazionePagina
        percorso={[{ etichetta: 'Segnalazioni' }]}
        titolo="Segnalazioni in quarantena"
        descrizione="Il classificatore mette da parte i contenuti che sembrano offensivi. Qui una persona decide."
      />

      {esito && (
        <CalloutAvviso tono={esito.tono} titolo={esito.titolo} className="mb-6">
          {esito.testo}
        </CalloutAvviso>
      )}

      {error && (
        <CalloutAvviso tono="errore" titolo="Lettura non riuscita" className="mb-6">
          Non siamo riusciti a leggere la coda. Ricarica fra poco.
        </CalloutAvviso>
      )}

      <nav aria-label="Filtra la coda" className="mb-6 flex flex-wrap gap-2">
        <Link
          href="/admin/segnalazioni"
          aria-current={stato === 'da-rivedere' ? 'true' : undefined}
          className={`inline-flex min-h-11 items-center rounded-pill px-4 text-small font-semibold ${
            stato === 'da-rivedere' ? 'bg-primary-500 text-white' : 'bg-surface-alt text-ink'
          }`}
        >
          Da rivedere
        </Link>
        <Link
          href="/admin/segnalazioni?stato=riviste"
          aria-current={stato === 'riviste' ? 'true' : undefined}
          className={`inline-flex min-h-11 items-center rounded-pill px-4 text-small font-semibold ${
            stato === 'riviste' ? 'bg-primary-500 text-white' : 'bg-surface-alt text-ink'
          }`}
        >
          Già decise
        </Link>
      </nav>

      {segnalazioni.length === 0 ? (
        <RiquadroVuoto
          titolo={stato === 'da-rivedere' ? 'Nessuna segnalazione da rivedere' : 'Nessuna decisione presa finora'}
        >
          {stato === 'da-rivedere' ? (
            <p>
              La coda è vuota: nessun contenuto è stato messo da parte. Se ti
              aspettavi qualcosa, controlla che il triage stia girando.
            </p>
          ) : (
            <p>Quando deciderai su una segnalazione, la ritroverai qui con la tua firma.</p>
          )}
        </RiquadroVuoto>
      ) : (
        <ul className="flex flex-col gap-6">
          {segnalazioni.map((s) => {
            const categorie = categorieDi(s.moderation_categories)
            const punteggio =
              s.moderation_score === null ? null : Math.round(Number(s.moderation_score) * 100)
            const media = s.report_media ?? []

            return (
              <CardIstituzionale as="li" key={s.id}>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-caption text-ink-muted">
                  <span>{dataLunga(s.created_at)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{CANALI[s.channel] ?? s.channel}</span>
                  {s.city && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>
                        {s.city}
                        {s.neighborhood ? `, ${s.neighborhood}` : ''}
                      </span>
                    </>
                  )}
                </div>

                <h2 className="mt-2 text-h4">
                  {categorie.length > 0
                    ? `Segnalata per ${categorie.join(', ')}`
                    : 'Messa da parte senza categoria'}
                </h2>

                <p className="mt-1 text-small text-ink-muted">
                  {punteggio === null
                    ? 'Nessun punteggio registrato.'
                    : `Il classificatore è sicuro al ${punteggio} per cento.`}{' '}
                  {s.previous_cluster_id
                    ? 'Prima della quarantena faceva parte di un gruppo.'
                    : 'Non faceva parte di nessun gruppo.'}
                </p>

                {/* Il testo grezzo, che è il motivo per cui questa pagina
                    esiste. Si legge per decidere, non si copia altrove. */}
                <blockquote className="mt-4 border-l-4 border-surface-strong bg-surface-alt p-4 text-body whitespace-pre-wrap text-ink">
                  {s.raw_text}
                </blockquote>

                {media.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-small font-semibold text-ink">Allegati</h3>
                    <ul className="mt-2 flex flex-col gap-2">
                      {media.map((m) => (
                        <li key={m.id} className="text-small text-ink-muted">
                          <span className="font-semibold text-ink">
                            {MEDIA_KIND_LABELS[m.kind]}
                          </span>
                          {m.duration_seconds ? ` · ${m.duration_seconds} secondi` : ''}
                          {': '}
                          {m.transcript ?? m.description ?? 'nessuna trascrizione disponibile'}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-caption text-ink-muted">
                      Il file originale non si apre da qui: la voce e i volti
                      restano nel deposito privato.
                    </p>
                  </div>
                )}

                {s.moderation_reviewed_by ? (
                  <p className="mt-4 text-small text-ink">
                    Decisa da{' '}
                    <span className="font-semibold">{s.moderation_reviewed_by}</span>
                    {s.moderation_reviewed_at ? ` il ${dataLunga(s.moderation_reviewed_at)}` : ''}.{' '}
                    {s.status === 'quarantena'
                      ? 'Resta fuori dai gruppi.'
                      : 'È tornata nel flusso normale.'}
                  </p>
                ) : (
                  <div className="mt-6 flex flex-wrap gap-3">
                    <AzioneConConferma
                      azione={riammettiSegnalazione}
                      campi={{ id: s.id, stato }}
                      etichetta="Riammetti"
                      domanda="La segnalazione torna in circolo e il triage la rielabora. La tua firma resta sulla decisione."
                      conferma="Sì, riammetti"
                      variante="primary"
                    />
                    <AzioneConConferma
                      azione={confermaQuarantena}
                      campi={{ id: s.id, stato }}
                      etichetta="Conferma la quarantena"
                      domanda="Resta fuori dai gruppi e dagli atti. Non viene cancellata: puoi tornarci sopra."
                      conferma="Sì, resta fuori"
                      variante="danger"
                    />
                  </div>
                )}
              </CardIstituzionale>
            )
          })}
        </ul>
      )}

      <p className="mt-8 text-small text-ink-muted">
        Nessuna segnalazione viene cancellata da questa pagina. La quarantena
        mette da parte, non distrugge.
      </p>
    </>
  )
}
