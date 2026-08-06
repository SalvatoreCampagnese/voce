/**
 * Riconoscimento del brigading: venti segnalazioni quasi identiche da venti
 * account nuovi non sono un movimento, sono una campagna. Il rate limit
 * protegge dal singolo che scrive troppo, non da venti che scrivono una volta
 * ciascuno mettendosi d'accordo altrove.
 *
 * IL LIMITE INVALICABILE, che decide la forma di tutto questo file.
 * Nessun punteggio di affidabilità sulle persone. Mai. Si valuta il GRUPPO,
 * mai il cittadino (PLAN2 §7, prima riga di «cosa NON costruire»). Un punteggio
 * per persona finirebbe per pesare di meno chi scrive male, chi scrive in una
 * lingua che non è la sua, chi è arrabbiato: esattamente le voci che VOCE esiste
 * per far arrivare. Conseguenze operative, non negoziabili:
 *
 *   · questo modulo non scrive NIENTE sulla tabella `citizens` e non tiene da
 *     nessuna parte memoria del comportamento di una persona;
 *   · la funzione SQL su cui si appoggia prende un `cluster_id` e non accetta un
 *     `citizen_id`: non esiste una versione «per cittadino» da chiamare per
 *     sbaglio;
 *   · l'esito non limita nessun singolo. Non toglie la parola a nessuno, non
 *     rallenta nessuno, non compare in nessuna pagina pubblica.
 *
 * E l'esito è REVISIONE UMANA, non blocco. Il gruppo resta visibile — le viste
 * pubbliche non filtrano `review_flag` — perché la voce dei cittadini non si
 * spegne su un sospetto statistico. Quello che il flag ferma è la generazione
 * degli atti, e la ferma il database con il trigger
 * `actions_before_insert_review`: un atto costruito su una campagna coordinata
 * danneggia chi lo firma in buona fede, una pagina di gruppo no.
 *
 * **Solo server**: usa il client con service role, perché la funzione SQL dei
 * segnali è concessa a `service_role` e a nessun altro ruolo.
 */

import { createServiceClient } from '@/lib/supabase/service'
import { logger } from '@/lib/utils/logger'

// ---------------------------------------------------------------------------
// Soglie
//
// SU COSA NON SONO TARATE: su niente. Non esistono ancora casi veri di
// brigading su VOCE, quindi non c'è un solo esempio positivo su cui misurarle.
// Sono scelte a tavolino e la loro taratura è un lavoro del pilot: si tengono i
// segnali grezzi nei log (`brigading.valutato`) anche quando non scatta niente,
// proprio per poterle rileggere su dati reali fra qualche settimana.
//
// IL RAPPORTO FRA I DUE DANNI, che è ciò che le orienta.
// Sbagliare per eccesso: un gruppo legittimo va in revisione. Costa a un
// amministratore qualche minuto di lettura e ritarda i suoi atti di un giorno;
// il gruppo resta pubblico, i cittadini non se ne accorgono.
// Sbagliare per difetto: VOCE costruisce un esposto su una campagna coordinata,
// lo manda a un ente con l'intestazione di venti cittadini, e la prima volta che
// un giornale lo scopre non è più credibile nessuno degli altri esposti — nemmeno
// i veri. Il secondo danno è irreversibile e ricade su chi ha firmato in buona
// fede; il primo si misura in minuti. Le soglie sono quindi tarate per essere
// SENSIBILI, non precise: meglio dieci revisioni inutili di una campagna passata.
//
// Con un'eccezione che tira nella direzione opposta, e va detta: al lancio in un
// comune TUTTI gli account sono nuovi, e tutte le prime segnalazioni arrivano
// nelle stesse ore perché il volantino è uscito quel giorno. Se bastasse un solo
// segnale, il primo gruppo di ogni nuova città finirebbe in revisione. Per questo
// serve la combinazione di due segnali, e uno solo basta solo quando è
// difficilmente spiegabile in altro modo (testi quasi identici fra loro).
// ---------------------------------------------------------------------------

/**
 * Sotto questa dimensione i segnali non si leggono: su cinque segnalazioni due
 * nella stessa ora sono una coincidenza normale, non una campagna.
 */
const MIN_SEGNALAZIONI_VALUTABILI = 8

/**
 * Il coordinamento richiede più persone. Con uno o due cittadini non c'è una
 * campagna: c'è al massimo qualcuno che insiste, e la soglia d'azione — che
 * conta cittadini distinti — lo ferma già da sola.
 */
const MIN_CITTADINI_VALUTABILI = 3

/**
 * Quota di cittadini del gruppo il cui account è nato nelle 24 ore attorno alla
 * prima segnalazione. Alta significa «questi account sono comparsi insieme»;
 * non significa «queste persone sono sospette».
 */
const QUOTA_ACCOUNT_NUOVI = 0.7

/**
 * Quota di segnalazioni concentrate nell'ora solare più affollata. Un problema
 * vero arriva distribuito nei giorni, una campagna arriva in un pomeriggio.
 */
const QUOTA_STESSA_ORA = 0.6

/**
 * Similarità coseno media fra i testi del gruppo.
 *
 * Va letta sapendo due cose, altrimenti sembra bassa. Primo: un gruppo esiste
 * perché le sue segnalazioni si somigliano, quindi la similarità interna è alta
 * per costruzione (le soglie di clustering stanno a 0,55 e 0,60). Secondo:
 * l'embedding si calcola su `clean_text`, cioè su un italiano già normalizzato
 * dal modello — che avvicina fra loro anche testi scritti in modo molto diverso.
 * Il valore qui sotto vuole distinguere «venti persone raccontano lo stesso
 * problema con parole proprie» da «venti messaggi copiati dallo stesso
 * modello»: è il numero che più di tutti va rimisurato sul pilot.
 */
const SIMILARITA_INTERNA = 0.9

/**
 * Oltre questa similarità il segnale vale da solo: testi quasi identici non
 * hanno una spiegazione innocente paragonabile a quella degli account nuovi al
 * lancio in una città.
 */
const SIMILARITA_QUASI_COPIA = 0.96

/** Segnali concordanti necessari quando nessuno di essi è da solo decisivo. */
const SEGNALI_PER_SOSPETTO = 2

/**
 * Ampiezza della finestra dei «gruppi cresciuti», in ore. Deve coprire la
 * cadenza del cron (`recluster` gira una volta al giorno, vercel.json) più un
 * margine: se la finestra è più stretta dell'intervallo fra due esecuzioni, i
 * gruppi cresciuti nel buco non vengono valutati da nessuno.
 */
const FINESTRA_GRUPPI_CRESCIUTI_ORE = 26

export interface EsitoBrigading {
  sospetto: boolean
  /** Spiegazione in italiano leggibile da una persona. `null` se non sospetto. */
  motivo: string | null
}

export interface EsitoScansioneBrigading {
  esaminati: number
  segnalati: number
  interrottoPerTempo: boolean
}

/** Percentuale intera, per una frase che deve leggere un essere umano. */
function percentuale(quota: number): number {
  return Math.round(quota * 100)
}

/** Decimale con la virgola: il motivo lo legge un amministratore italiano. */
function decimale(valore: number): string {
  return valore.toLocaleString('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Valuta i segnali di coordinamento di un gruppo e, se sono concordanti, lo
 * manda in revisione umana.
 *
 * Non lancia mai: una valutazione fallita non deve fermare il clustering, che è
 * il lavoro che fa arrivare le persone le une alle altre. In caso di errore si
 * logga e si restituisce «non sospetto» — cioè si sbaglia dalla parte del
 * cittadino, non da quella del sospetto automatico.
 */
export async function valutaBrigading(clusterId: string): Promise<EsitoBrigading> {
  const log = logger.child({ cluster_id: clusterId, job: 'brigading' })
  const sb = createServiceClient()

  try {
    const { data: gruppo, error: erroreGruppo } = await sb
      .from('clusters')
      .select('id, review_flag, review_reason, reviewed_at, is_synthetic')
      .eq('id', clusterId)
      .maybeSingle()

    if (erroreGruppo) {
      log.error('brigading.lettura_gruppo_fallita', { error: erroreGruppo })
      return { sospetto: false, motivo: null }
    }

    if (!gruppo) {
      log.warn('brigading.gruppo_assente')
      return { sospetto: false, motivo: null }
    }

    // I dati sintetici del seed sono generati in blocco: account creati insieme,
    // testi da modello, tutti nella stessa ora. Sono il caso peggiore possibile
    // per questi segnali e riempirebbero la coda di revisione di rumore, senza
    // che nessuno di quei gruppi possa mai produrre un atto o una pagina.
    if (gruppo.is_synthetic) {
      return { sospetto: false, motivo: null }
    }

    // Già segnalato: nessuna riscrittura. Riscrivere `review_reason` sposterebbe
    // `updated_at`, e il gruppo tornerebbe a ogni giro nella finestra dei
    // «cresciuti di recente», rivalutato all'infinito senza che cambi niente.
    if (gruppo.review_flag) {
      return { sospetto: true, motivo: gruppo.review_reason }
    }

    // Una persona ha già guardato questo gruppo e ha deciso. Non si rialza un
    // flag che un amministratore ha abbassato: il giudizio umano è il punto di
    // arrivo di questa procedura, non un parere da correggere con una query.
    // Limite noto: un gruppo assolto oggi e montato fra sei mesi non verrà più
    // rivalutato in automatico. Va riaperto a mano.
    if (gruppo.reviewed_at) {
      return { sospetto: false, motivo: null }
    }

    const { data: righe, error: erroreSegnali } = await sb.rpc('cluster_brigading_signals', {
      target: clusterId,
    })

    if (erroreSegnali) {
      log.error('brigading.segnali_falliti', { error: erroreSegnali })
      return { sospetto: false, motivo: null }
    }

    const segnali = righe?.[0]
    if (!segnali) {
      log.warn('brigading.segnali_vuoti')
      return { sospetto: false, motivo: null }
    }

    const nSegnalazioni = segnali.n_reports ?? 0
    const nCittadini = segnali.n_citizens ?? 0
    const nNuovi = segnali.n_citizens_nuovi ?? 0
    const quotaStessaOra = segnali.quota_stessa_ora ?? 0
    const similarita = segnali.similarita_media_interna ?? 0

    if (nSegnalazioni < MIN_SEGNALAZIONI_VALUTABILI || nCittadini < MIN_CITTADINI_VALUTABILI) {
      return { sospetto: false, motivo: null }
    }

    const quotaNuovi = nCittadini > 0 ? nNuovi / nCittadini : 0

    // I segnali si raccolgono tutti, anche quando poi non scatta niente: sono la
    // sola base su cui queste soglie potranno essere tarate su dati veri.
    log.info('brigading.valutato', {
      n_reports: nSegnalazioni,
      n_citizens: nCittadini,
      quota_account_nuovi: Number(quotaNuovi.toFixed(3)),
      quota_stessa_ora: Number(quotaStessaOra.toFixed(3)),
      similarita_media_interna: Number(similarita.toFixed(3)),
    })

    const motivi: string[] = []

    if (quotaNuovi >= QUOTA_ACCOUNT_NUOVI) {
      motivi.push(
        `${nNuovi} cittadini su ${nCittadini} (${percentuale(quotaNuovi)}%) hanno aperto ` +
          "l'account nelle 24 ore attorno alla prima segnalazione",
      )
    }

    if (quotaStessaOra >= QUOTA_STESSA_ORA) {
      motivi.push(
        `il ${percentuale(quotaStessaOra)}% delle segnalazioni è arrivato in una sola ora`,
      )
    }

    if (similarita >= SIMILARITA_INTERNA) {
      motivi.push(
        `similarità media fra i testi ${decimale(similarita)} ` +
          `(soglia ${decimale(SIMILARITA_INTERNA)})`,
      )
    }

    const quasiCopia = similarita >= SIMILARITA_QUASI_COPIA
    const sospetto = quasiCopia || motivi.length >= SEGNALI_PER_SOSPETTO

    if (!sospetto) {
      return { sospetto: false, motivo: null }
    }

    const motivo =
      `${nSegnalazioni} segnalazioni da ${nCittadini} cittadini distinti. ` +
      `${motivi.join('; ')}. ` +
      'Segnali di coordinamento: il gruppo resta pubblico, gli atti attendono una revisione.'

    const { data: aggiornati, error: erroreFlag } = await sb
      .from('clusters')
      .update({ review_flag: true, review_reason: motivo })
      .eq('id', clusterId)
      // Difesa contro due valutazioni in parallelo: chi arriva secondo non
      // sovrascrive il motivo del primo e non risveglia `updated_at`.
      .eq('review_flag', false)
      // `.select()` non è decorativo: un update che non trova righe è un no-op
      // silenzioso, senza errore. Senza le righe restituite non si distingue
      // «ho segnalato il gruppo» da «qualcun altro mi ha preceduto».
      .select('id')

    if (erroreFlag) {
      log.error('brigading.flag_fallito', { error: erroreFlag, motivo })
      return { sospetto: true, motivo }
    }

    if (!aggiornati?.length) {
      log.info('brigading.flag_gia_presente')
      return { sospetto: true, motivo }
    }

    log.warn('brigading.gruppo_segnalato', {
      motivo,
      n_reports: nSegnalazioni,
      n_citizens: nCittadini,
    })

    return { sospetto: true, motivo }
  } catch (errore) {
    log.error('brigading.valutazione_fallita', { error: errore })
    return { sospetto: false, motivo: null }
  }
}

/**
 * Rivaluta i gruppi cresciuti dall'ultimo giro del cron.
 *
 * Un gruppo nasce pulito e diventa una campagna dopo: la valutazione alla
 * creazione da sola non vedrebbe mai le diciotto segnalazioni arrivate la sera
 * dopo. `updated_at` si muove quando i contatori del gruppo vengono ricalcolati
 * (`refresh_cluster_counters`), quindi «cresciuto» e «toccato di recente»
 * coincidono abbastanza da bastare, senza aggiungere una colonna di stato.
 *
 * Non lancia: come `valutaBrigading`, un fallimento qui non deve far fallire il
 * cron che raggruppa le segnalazioni.
 */
export async function scansionaGruppiCresciuti(opzioni?: {
  /** Limite di gruppi esaminati in un giro. */
  limite?: number
  /** Tempo che la scansione può consumare prima di fermarsi da sola. */
  budgetMs?: number
}): Promise<EsitoScansioneBrigading> {
  const limite = opzioni?.limite ?? 50
  const budgetMs = opzioni?.budgetMs ?? 15_000
  const inizio = Date.now()

  const esito: EsitoScansioneBrigading = {
    esaminati: 0,
    segnalati: 0,
    interrottoPerTempo: false,
  }

  if (budgetMs <= 0) {
    esito.interrottoPerTempo = true
    return esito
  }

  const sb = createServiceClient()
  const da = new Date(Date.now() - FINESTRA_GRUPPI_CRESCIUTI_ORE * 60 * 60 * 1000).toISOString()

  const { data: gruppi, error } = await sb
    .from('clusters')
    .select('id')
    // Già segnalati: aspettano una persona, non un'altra valutazione.
    .eq('review_flag', false)
    // Già rivisti da una persona: la sua decisione vale più di questa euristica.
    .is('reviewed_at', null)
    .eq('is_synthetic', false)
    .gte('updated_at', da)
    .order('updated_at', { ascending: false })
    .limit(limite)

  if (error) {
    logger.error('brigading.scansione_lettura_fallita', { error, job: 'brigading' })
    return esito
  }

  for (const gruppo of gruppi ?? []) {
    if (Date.now() - inizio > budgetMs) {
      esito.interrottoPerTempo = true
      break
    }

    esito.esaminati += 1
    const risultato = await valutaBrigading(gruppo.id)
    if (risultato.sospetto) esito.segnalati += 1
  }

  return esito
}
