/**
 * Le notifiche ai cittadini — PLAN2 §1.1.
 *
 * Il bot risponde a chiunque scriva: «ti scrivo appena diventa parte di
 * un'azione collettiva». Finora nessuna riga di codice manteneva quella frase.
 * Una persona segnalava, aspettava, e non riceveva mai niente — nemmeno quando
 * il suo gruppo si formava davvero. È il difetto più grave del progetto, perché
 * rompe l'unico patto che VOCE stringe con chi si fida.
 *
 * IL MECCANISMO, IN TRE PEZZI
 *   1. `rilevaEventiDaNotificare()` confronta lo stato attuale dei gruppi con
 *      le notifiche già emesse e accoda quello che manca. Gira da cron.
 *   2. `accodaNotifica()` scrive una riga in `notifications`. Il `dedupe_key` è
 *      UNIQUE: un job eseguito due volte non scrive due volte. Ricevere lo
 *      stesso avviso due volte è il modo più veloce di far disiscrivere qualcuno.
 *   3. `spediciNotifichePendenti()` svuota la coda e registra l'esito. Dopo
 *      l'ultimo tentativo la riga resta con `failed_at`, così una promessa non
 *      mantenuta finisce sotto gli occhi di una persona invece che in un log.
 *
 * DOVE STA IL RECAPITO
 * Mai dentro la notifica. `notifications.payload` ha un vincolo di database che
 * rifiuta telefono, email, identificatore Telegram e simili: il recapito si
 * legge da `citizens` al momento dell'invio e non resta scritto da nessuna
 * parte. Nel payload vanno solo identificatori tecnici e testi già pubblici.
 *
 * **Solo server** (service role).
 */

import { NOTIFICHE_BATCH_SIZE, NOTIFICHE_MAX_TENTATIVI } from '@/lib/config/constants'
import { serverEnv } from '@/lib/config/env'
import { getSoglie } from '@/lib/config/thresholds'
import { inviaEmail } from '@/lib/channels/email'
import { inviaMessaggioTelegram } from '@/lib/channels/telegram'
import {
  componiMessaggio,
  type CanaleAvviso,
  type MessaggioComposto,
  type TipoAvviso,
} from '@/lib/notifications/testi'
import { createServiceClient } from '@/lib/supabase/service'
import { logger } from '@/lib/utils/logger'
import type { Json, NotificationInsert } from '@voce/db'

/**
 * Tipi di avviso. Coincide con l'enum SQL `notification_kind`: prenderlo di lì
 * evita che una nuova voce dello schema resti senza testo per mesi.
 *
 * Passa da `testi.ts` e non direttamente dai tipi generati perché i due esiti
 * della moderazione (`moderazione_riammessa`, `moderazione_confermata`) sono
 * arrivati nel database con la migrazione `20260806000011` e nei tipi generati
 * ci saranno solo alla prossima rigenerazione. Il testo esiste già: un tipo
 * che li conosce e un database che li accetta bastano a farli funzionare.
 */
export type TipoNotifica = TipoAvviso

export interface NuovaNotifica {
  citizenId: string
  tipo: TipoNotifica
  clusterId?: string | null
  actionId?: string | null
  reportId?: string | null
  /** Chiave di deduplica: stesso evento, stessa chiave, una sola notifica. */
  dedupeKey: string
  payload?: Record<string, unknown>
}

export interface EsitoRilevamento {
  gruppiEsaminati: number
  accodate: number
  /** Candidate scartate: già accodate, cittadino sintetico o senza recapito. */
  saltate: number
}

export interface EsitoSpedizione {
  spedite: number
  fallite: number
  saltate: number
}

// ---------------------------------------------------------------------------
// Limiti di scansione
//
// Non sono soglie di prodotto (quelle stanno in thresholds.ts): sono tetti al
// lavoro di un singolo giro, per non trasformare un cron notturno in una
// scansione dell'intero storico. Il vincolo UNIQUE su `dedupe_key` resta la
// garanzia vera: quello che non entra in un giro entra in quello dopo.
// ---------------------------------------------------------------------------

/** Gruppi guardati per giro, dal più recentemente modificato. */
const MAX_GRUPPI_PER_GIRO = 200

/** Segnalazioni caricate per ricostruire chi sta in quali gruppi. */
const MAX_SEGNALAZIONI_PER_GIRO = 2_000

/** Chiavi già emesse caricate per evitare inserimenti inutili. */
const MAX_CHIAVI_NOTE = 10_000

/**
 * Chiavi che `notifications.payload` non può contenere: sono le stesse del
 * vincolo `notifications_payload_senza_identificatori`. Si filtrano qui invece
 * di lasciar fallire l'insert, perché una notifica persa per un payload
 * sbagliato è esattamente il guasto che questo modulo esiste per evitare.
 */
const CHIAVI_VIETATE_NEL_PAYLOAD = new Set([
  'raw_text',
  'clean_text',
  'phone',
  'phone_e164',
  'email',
  'telegram_id',
  'chat_id',
  'whatsapp',
  'display_name',
  'ip',
  'ip_hash',
  'public_token',
])

/**
 * Ragione registrata per chi ha lasciato solo un numero di telefono.
 *
 * WhatsApp non è collegato. La riga si accoda lo stesso, già fallita: così il
 * pannello dice **quante persone stiamo lasciando indietro** invece di non
 * dirlo. Un canale mancante deve essere un numero, non un vuoto.
 */
const MOTIVO_WHATSAPP = 'canale whatsapp non ancora attivo: nessun invio effettuato'

// ---------------------------------------------------------------------------
// Accodamento
// ---------------------------------------------------------------------------

interface RecapitiCittadino {
  is_synthetic: boolean
  telegram_id: number | null
  email: string | null
  phone_e164: string | null
}

/**
 * Il canale su cui scrivere a questa persona.
 *
 * Telegram per primo perché è lì che la promessa è stata fatta: chi ha scritto
 * al bot si aspetta la risposta nella stessa conversazione, non in una casella
 * di posta che magari non ha nemmeno indicato.
 */
function scegliCanale(c: RecapitiCittadino): CanaleAvviso | null {
  if (c.telegram_id !== null) return 'telegram'
  if (c.email) return 'email'
  if (c.phone_e164) return 'whatsapp'
  return null
}

function ripulisciPayload(
  payload: Record<string, unknown> | undefined,
  dedupe: string,
): Json {
  if (!payload) return {} as Json

  const pulito: Record<string, unknown> = {}
  const rimosse: string[] = []

  for (const [chiave, valore] of Object.entries(payload)) {
    if (valore === undefined) continue
    if (CHIAVI_VIETATE_NEL_PAYLOAD.has(chiave.toLowerCase())) {
      rimosse.push(chiave)
      continue
    }
    pulito[chiave] = valore
  }

  if (rimosse.length > 0) {
    logger.warn('notifiche.payload_ripulito', { dedupe, chiavi: rimosse })
  }

  return pulito as Json
}

/**
 * Accoda una notifica. Idempotente: una `dedupeKey` già presente non fa niente.
 *
 * Non lancia mai. La chiamano più job in parallelo (rilevamento, scadenzario) e
 * un'eccezione non gestita fermerebbe il giro di tutti: l'errore si logga e si
 * restituisce `false`.
 *
 * @returns `true` se una riga nuova è stata scritta.
 */
export async function accodaNotifica(n: NuovaNotifica): Promise<boolean> {
  const sb = createServiceClient()
  const log = logger.child({
    citizen_id: n.citizenId,
    cluster_id: n.clusterId ?? null,
    action_id: n.actionId ?? null,
    report_id: n.reportId ?? null,
    tipo: n.tipo,
  })

  const { data: cittadino, error: erroreCittadino } = await sb
    .from('citizens')
    .select('is_synthetic, telegram_id, email, phone_e164')
    .eq('id', n.citizenId)
    .maybeSingle()

  if (erroreCittadino) {
    log.error('notifiche.cittadino_non_letto', { error: erroreCittadino })
    return false
  }

  if (!cittadino) {
    log.warn('notifiche.cittadino_inesistente')
    return false
  }

  if (cittadino.is_synthetic) {
    // I dati di prova non escono mai verso l'esterno, nemmeno come avviso:
    // un cittadino sintetico può avere il recapito di una persona vera.
    log.debug('notifiche.cittadino_sintetico_ignorato')
    return false
  }

  const canale = scegliCanale(cittadino)
  if (!canale) {
    log.warn('notifiche.senza_recapito')
    return false
  }

  const riga: NotificationInsert = {
    citizen_id: n.citizenId,
    channel: canale,
    // Unico punto di conversione verso i tipi generati. Il database conosce
    // tutti e nove i valori (migrazione 20260806000011); `packages/db/src/
    // types.ts` ne elenca ancora sette perché va rigenerato. Quando lo sarà,
    // questa asserzione diventerà un'identità e si potrà togliere.
    kind: n.tipo as NotificationInsert['kind'],
    cluster_id: n.clusterId ?? null,
    action_id: n.actionId ?? null,
    report_id: n.reportId ?? null,
    dedupe_key: n.dedupeKey,
    payload: ripulisciPayload(n.payload, n.dedupeKey),
    // Nasce già fallita quando il canale non esiste: la riga serve a contare
    // chi resta fuori, non a essere ritentata all'infinito.
    ...(canale === 'whatsapp'
      ? { failed_at: new Date().toISOString(), last_error: MOTIVO_WHATSAPP }
      : {}),
  }

  const { error: erroreInsert } = await sb.from('notifications').insert(riga)

  if (erroreInsert) {
    // 23505 = violazione di unicità su `dedupe_key`. Non è un guasto: è il
    // meccanismo che rende innocuo un job eseguito due volte.
    if (erroreInsert.code === '23505') return false

    log.error('notifiche.accodamento_fallito', { error: erroreInsert })
    return false
  }

  if (canale === 'whatsapp') {
    log.warn('notifiche.canale_whatsapp_mancante', { canale })
  } else {
    log.info('notifiche.accodata', { canale })
  }

  return true
}

// ---------------------------------------------------------------------------
// Rilevamento degli eventi
// ---------------------------------------------------------------------------

/**
 * Confronta lo stato dei gruppi con le notifiche già emesse e accoda quello che
 * manca. I quattro eventi di PLAN2 §1.1:
 *
 *   1. il tuo gruppo si è formato   — la tua segnalazione ha un `cluster_id`;
 *   2. il gruppo è diventato pubblico — `citizens_count` ha raggiunto la soglia;
 *   3. è stata preparata una bozza  — esiste un atto per quel gruppo;
 *   4. l'amministrazione ha risposto — esiste una risposta **confermata**.
 *
 * Sul punto 4 non si transige: `confirmed_by` non nullo. Dire a cento persone
 * che il Comune ha risposto quando la classificazione non è ancora stata
 * verificata è un danno che non si ripara.
 *
 * Si parte dai gruppi ordinati per `updated_at`: la colonna viene aggiornata da
 * `refresh_cluster_counters()` a ogni ingresso o uscita di una segnalazione,
 * quindi «gruppo cambiato di recente» è esattamente «gruppo da guardare».
 *
 * `review_flag` NON filtra niente, come nella vista `public_clusters`: un
 * sospetto di coordinamento blocca gli atti e chiama una revisione umana, non
 * zittisce i cittadini che hanno segnalato.
 */
export async function rilevaEventiDaNotificare(): Promise<EsitoRilevamento> {
  const sb = createServiceClient()
  const soglie = getSoglie()
  const inizio = Date.now()
  const esito: EsitoRilevamento = { gruppiEsaminati: 0, accodate: 0, saltate: 0 }

  const { data: gruppi, error: erroreGruppi } = await sb
    .from('clusters')
    .select('id, title, citizens_count')
    .eq('is_synthetic', false)
    .order('updated_at', { ascending: false })
    .limit(MAX_GRUPPI_PER_GIRO)

  if (erroreGruppi) {
    logger.error('notifiche.rilevamento.gruppi_non_letti', { error: erroreGruppi })
    return esito
  }

  const elenco = gruppi ?? []
  if (elenco.length === 0) return esito
  esito.gruppiEsaminati = elenco.length

  const idGruppi = elenco.map((g) => g.id)

  // --- chi sta in quale gruppo ---------------------------------------------
  // In ordine cronologico: la prima segnalazione di una persona in un gruppo è
  // quella a cui puntare, perché è la pagina che quella persona conosce già.
  const { data: segnalazioni, error: erroreSegnalazioni } = await sb
    .from('reports')
    .select('id, citizen_id, cluster_id')
    .in('cluster_id', idGruppi)
    .eq('is_synthetic', false)
    .not('citizen_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(MAX_SEGNALAZIONI_PER_GIRO)

  if (erroreSegnalazioni) {
    logger.error('notifiche.rilevamento.segnalazioni_non_lette', { error: erroreSegnalazioni })
    return esito
  }

  const membriPerGruppo = new Map<string, Map<string, string>>()
  for (const r of segnalazioni ?? []) {
    if (!r.cluster_id || !r.citizen_id) continue
    let membri = membriPerGruppo.get(r.cluster_id)
    if (!membri) {
      membri = new Map<string, string>()
      membriPerGruppo.set(r.cluster_id, membri)
    }
    if (!membri.has(r.citizen_id)) membri.set(r.citizen_id, r.id)
  }

  // --- atti preparati -------------------------------------------------------
  // Un solo avviso per gruppo, non uno per atto: la generazione produce quattro
  // bozze insieme e quattro messaggi identici in fila fanno bloccare il bot.
  const { data: atti, error: erroreAtti } = await sb
    .from('actions')
    .select('id, cluster_id')
    .in('cluster_id', idGruppi)
    .eq('is_synthetic', false)
    .order('created_at', { ascending: true })

  if (erroreAtti) {
    logger.error('notifiche.rilevamento.atti_non_letti', { error: erroreAtti })
    return esito
  }

  const primoAttoPerGruppo = new Map<string, string>()
  const gruppoPerAtto = new Map<string, string>()
  for (const a of atti ?? []) {
    gruppoPerAtto.set(a.id, a.cluster_id)
    if (!primoAttoPerGruppo.has(a.cluster_id)) primoAttoPerGruppo.set(a.cluster_id, a.id)
  }

  // --- risposte confermate --------------------------------------------------
  const rispostePerGruppo = new Map<string, { id: string; actionId: string }[]>()
  const idAtti = [...gruppoPerAtto.keys()]

  if (idAtti.length > 0) {
    const { data: risposte, error: erroreRisposte } = await sb
      .from('action_responses')
      .select('id, action_id')
      .in('action_id', idAtti)
      .not('confirmed_by', 'is', null)

    if (erroreRisposte) {
      logger.error('notifiche.rilevamento.risposte_non_lette', { error: erroreRisposte })
      return esito
    }

    for (const r of risposte ?? []) {
      const clusterId = gruppoPerAtto.get(r.action_id)
      if (!clusterId) continue
      const elencoRisposte = rispostePerGruppo.get(clusterId) ?? []
      elencoRisposte.push({ id: r.id, actionId: r.action_id })
      rispostePerGruppo.set(clusterId, elencoRisposte)
    }
  }

  // --- cosa è già stato mandato --------------------------------------------
  // È solo un'ottimizzazione: risparmia un insert destinato a violare il
  // vincolo. Se questo elenco fosse incompleto il risultato non cambierebbe,
  // perché la garanzia di non ripetersi sta nel database, non qui.
  const { data: emesse, error: erroreEmesse } = await sb
    .from('notifications')
    .select('dedupe_key')
    .in('cluster_id', idGruppi)
    .limit(MAX_CHIAVI_NOTE)

  if (erroreEmesse) {
    logger.error('notifiche.rilevamento.chiavi_non_lette', { error: erroreEmesse })
    return esito
  }

  const note = new Set((emesse ?? []).map((r) => r.dedupe_key))

  // --- costruzione delle candidate -----------------------------------------
  const candidate: NuovaNotifica[] = []

  const aggiungi = (n: NuovaNotifica) => {
    if (note.has(n.dedupeKey)) return
    note.add(n.dedupeKey)
    candidate.push(n)
  }

  for (const gruppo of elenco) {
    const membri = membriPerGruppo.get(gruppo.id)
    if (!membri) continue

    const ePubblico = gruppo.citizens_count >= soglie.minPublicCitizens
    const attoId = primoAttoPerGruppo.get(gruppo.id) ?? null
    const risposte = rispostePerGruppo.get(gruppo.id) ?? []
    const payload = { titolo: gruppo.title }

    // Un gruppo può nascere con le segnalazioni di UNA sola persona: bastano
    // cinque racconti simili, e chi scrive cinque volte ottiene di essere
    // ascoltato, non di sembrare un movimento (vedi lib/ai/clustering.ts).
    // Il messaggio «gruppo formato» però dice al cittadino che altri hanno
    // raccontato lo stesso problema: mandarglielo quando è ancora solo è una
    // bugia, e per giunta la più crudele possibile — gli si promette compagnia
    // che non c'è. Si avvisa solo quando i cittadini distinti sono almeno due.
    const eDavveroCollettivo = gruppo.citizens_count >= 2

    for (const [citizenId, reportId] of membri) {
      if (eDavveroCollettivo) {
        aggiungi({
          citizenId,
          tipo: 'gruppo_formato',
          clusterId: gruppo.id,
          reportId,
          dedupeKey: `gruppo_formato:${gruppo.id}:${citizenId}`,
          payload,
        })
      }

      if (ePubblico) {
        aggiungi({
          citizenId,
          tipo: 'gruppo_pubblico',
          clusterId: gruppo.id,
          reportId,
          dedupeKey: `gruppo_pubblico:${gruppo.id}:${citizenId}`,
          payload,
        })
      }

      if (attoId) {
        aggiungi({
          citizenId,
          tipo: 'atto_preparato',
          clusterId: gruppo.id,
          actionId: attoId,
          reportId,
          dedupeKey: `atto_preparato:${gruppo.id}:${citizenId}`,
          payload,
        })
      }

      for (const risposta of risposte) {
        aggiungi({
          citizenId,
          tipo: 'pa_ha_risposto',
          clusterId: gruppo.id,
          actionId: risposta.actionId,
          reportId,
          dedupeKey: `pa_ha_risposto:${risposta.id}:${citizenId}`,
          payload,
        })
      }
    }
  }

  for (const candidata of candidate) {
    if (Date.now() - inizio > soglie.cronTimeBudgetMs) {
      logger.warn('notifiche.rilevamento.budget_esaurito', {
        rimaste: candidate.length - esito.accodate - esito.saltate,
      })
      break
    }

    if (await accodaNotifica(candidata)) esito.accodate += 1
    else esito.saltate += 1
  }

  logger.info('notifiche.rilevamento.completato', { ...esito })
  return esito
}

// ---------------------------------------------------------------------------
// Spedizione
// ---------------------------------------------------------------------------

/**
 * Consegna il messaggio sul canale della riga.
 *
 * IL CANALE TELEGRAM VA CONTROLLATO, NON SOLO CHIAMATO.
 * `inviaMessaggioTelegram()` non lancia — nasce per non far fallire un webhook,
 * quindi cattura l'errore e restituisce `false`. Ignorare quel valore di ritorno
 * significa scrivere `sent_at` su una riga che Telegram ha rifiutato: la coda si
 * svuota, il pannello dice che va tutto bene, e il cittadino non riceve niente.
 * È il modo peggiore di rompere la promessa di PLAN2 §1.1, perché la rompe **in
 * silenzio** — peggio di non aver mai scritto il job, che almeno si nota.
 *
 * Le due cause più frequenti, entrambe reali: il cittadino ha bloccato il bot
 * (403 «bot was blocked by the user») e il chat id non esiste più. In tutti e
 * due i casi la riga deve fallire, consumare un tentativo e finire sotto gli
 * occhi di una persona.
 */
async function consegna(
  canale: CanaleAvviso,
  recapitoTelegram: number | null,
  recapitoEmail: string | null,
  messaggio: MessaggioComposto,
): Promise<void> {
  if (canale === 'telegram') {
    if (recapitoTelegram === null) throw new Error('recapito telegram assente')
    const consegnato = await inviaMessaggioTelegram(recapitoTelegram, messaggio.testo)
    if (!consegnato) {
      // Il messaggio esatto lo ha già loggato inviaMessaggioTelegram: qui serve
      // solo far fallire il tentativo. Niente recapiti nel testo dell'errore —
      // `last_error` viene mascherato da un trigger, ma non ci si appoggia.
      throw new Error('Telegram non ha accettato il messaggio')
    }
    return
  }

  if (canale === 'email') {
    if (!recapitoEmail) throw new Error('recapito email assente')
    await inviaEmail(recapitoEmail, messaggio.oggetto, messaggio.testo)
    return
  }

  throw new Error(MOTIVO_WHATSAPP)
}

/**
 * Svuota la coda delle notifiche. La chiama il cron.
 *
 * Un tentativo consuma sempre un `attempts`: al superamento di
 * `NOTIFICHE_MAX_TENTATIVI` la riga prende `failed_at` ed esce dalla coda.
 * Non sparisce: resta visibile nel pannello, perché una promessa non mantenuta
 * va guardata da una persona.
 */
export async function spediciNotifichePendenti(
  limite: number = NOTIFICHE_BATCH_SIZE,
): Promise<EsitoSpedizione> {
  const sb = createServiceClient()
  const soglie = getSoglie()
  const inizio = Date.now()
  const esito: EsitoSpedizione = { spedite: 0, fallite: 0, saltate: 0 }

  const { data: coda, error: erroreCoda } = await sb
    .from('notifications')
    .select('id, citizen_id, channel, kind, cluster_id, action_id, report_id, payload, attempts')
    .is('sent_at', null)
    .is('failed_at', null)
    .lt('attempts', NOTIFICHE_MAX_TENTATIVI)
    .order('created_at', { ascending: true })
    .limit(limite)

  if (erroreCoda) {
    logger.error('notifiche.coda_non_letta', { error: erroreCoda })
    return esito
  }

  const righe = coda ?? []
  if (righe.length === 0) return esito

  // Il recapito si legge adesso, non è mai stato copiato nella notifica.
  const idCittadini = [...new Set(righe.map((r) => r.citizen_id))]
  const { data: cittadini, error: erroreCittadini } = await sb
    .from('citizens')
    .select('id, is_synthetic, telegram_id, email, phone_e164, preferred_language')
    .in('id', idCittadini)

  if (erroreCittadini) {
    logger.error('notifiche.destinatari_non_letti', { error: erroreCittadini })
    return esito
  }

  const perCittadino = new Map((cittadini ?? []).map((c) => [c.id, c]))

  const idGruppi = [...new Set(righe.map((r) => r.cluster_id).filter((v): v is string => !!v))]
  const titoloPerGruppo = new Map<string, string>()
  if (idGruppi.length > 0) {
    const { data: gruppi } = await sb.from('clusters').select('id, title').in('id', idGruppi)
    for (const g of gruppi ?? []) titoloPerGruppo.set(g.id, g.title)
  }

  // Il token pubblico non può stare nel payload (vincolo di database): si
  // risolve qui, vive il tempo di comporre il messaggio e non viene salvato.
  const idSegnalazioni = [...new Set(righe.map((r) => r.report_id).filter((v): v is string => !!v))]
  const tokenPerSegnalazione = new Map<string, string>()
  if (idSegnalazioni.length > 0) {
    const { data: segnalazioni } = await sb
      .from('reports')
      .select('id, public_token')
      .in('id', idSegnalazioni)
    for (const s of segnalazioni ?? []) tokenPerSegnalazione.set(s.id, s.public_token)
  }

  const adesso = () => new Date().toISOString()

  async function registraFallimento(
    id: string,
    tentativiPrima: number,
    motivo: string,
  ): Promise<void> {
    const tentativi = tentativiPrima + 1
    const definitivo = tentativi >= NOTIFICHE_MAX_TENTATIVI

    const { error } = await sb
      .from('notifications')
      .update({
        attempts: tentativi,
        last_error: motivo.slice(0, 200),
        ...(definitivo ? { failed_at: adesso() } : {}),
      })
      .eq('id', id)

    if (error) logger.error('notifiche.esito_non_registrato', { error, notifica_id: id })
  }

  for (const riga of righe) {
    if (Date.now() - inizio > soglie.cronTimeBudgetMs) {
      logger.warn('notifiche.spedizione.budget_esaurito', { rimaste: righe.length - esito.spedite })
      break
    }

    const log = logger.child({
      citizen_id: riga.citizen_id,
      cluster_id: riga.cluster_id,
      action_id: riga.action_id,
      tipo: riga.kind,
      canale: riga.channel,
    })

    const cittadino = perCittadino.get(riga.citizen_id)

    if (!cittadino || cittadino.is_synthetic) {
      // Diventato sintetico o sparito fra accodamento e invio: si chiude la
      // riga invece di ritentarla per sempre.
      await registraFallimento(riga.id, NOTIFICHE_MAX_TENTATIVI - 1, 'destinatario non valido')
      esito.saltate += 1
      log.warn('notifiche.destinatario_non_valido')
      continue
    }

    const messaggio = componiMessaggio({
      tipo: riga.kind,
      canale: riga.channel,
      lingua: cittadino.preferred_language,
      titoloGruppo: riga.cluster_id ? (titoloPerGruppo.get(riga.cluster_id) ?? null) : null,
      urlGruppo: riga.cluster_id ? `${serverEnv.APP_URL}/gruppi/${riga.cluster_id}` : null,
      urlSegnalazione: riga.report_id
        ? tokenPerSegnalazione.has(riga.report_id)
          ? `${serverEnv.APP_URL}/segnalazione/${tokenPerSegnalazione.get(riga.report_id)}`
          : null
        : null,
    })

    try {
      await consegna(riga.channel, cittadino.telegram_id, cittadino.email, messaggio)

      const { error } = await sb
        .from('notifications')
        .update({ sent_at: adesso(), attempts: riga.attempts + 1, last_error: null })
        .eq('id', riga.id)

      if (error) {
        // Il messaggio è partito davvero: non lo si conta come fallito, ma va
        // detto forte, perché al prossimo giro verrà spedito di nuovo.
        logger.error('notifiche.invio_non_registrato', { error, notifica_id: riga.id })
      }

      esito.spedite += 1
      log.info('notifiche.spedita')
    } catch (errore) {
      const motivo = errore instanceof Error ? errore.message : String(errore)
      await registraFallimento(riga.id, riga.attempts, motivo)
      esito.fallite += 1
      log.error('notifiche.invio_fallito', { error: errore })
    }
  }

  logger.info('notifiche.spedizione.completata', { ...esito })
  return esito
}
