/**
 * L'atto di seguito: quello che si prepara quando il termine è scaduto e non è
 * arrivato niente.
 *
 * È il cuore di PLAN2 §3.1. Fino a qui VOCE sapeva scrivere una lettera; da qui
 * sa che cosa fare quando quella lettera non riceve risposta — che è il caso
 * normale, non l'eccezione. «Questo trasforma VOCE da "scrive una lettera" a
 * "non ti lascia solo dopo"».
 *
 * LA MACCHINA PREPARA, LA PERSONA FIRMA.
 * L'atto di seguito nasce `bozza`, come tutti gli altri, e nessun percorso di
 * questo file lo porta a `inviata`. Il vincolo `actions_review_before_send`
 * resta l'ultima parola e non va aggirato: PLAN2 §7 elenca l'invio automatico
 * degli atti fra le cose da non costruire, e la ragione è che un atto è un
 * documento firmato da persone vere davanti a un'istituzione. La generazione
 * automatica toglie l'attesa, non la firma.
 *
 * UN SOLO SEGUITO PER ATTO.
 * `follow_up_generated_at` viene valorizzato PRIMA di generare, con un update
 * condizionato che fa da lucchetto: due esecuzioni del job giornaliero che si
 * accavallano non producono due solleciti. Se poi la generazione fallisce, il
 * lucchetto viene tolto e il giorno dopo si riprova — un sollecito mancato è
 * recuperabile, un sollecito doppio a nome degli stessi cittadini no.
 */

import type { ActionKind } from '@voce/db'
import { ACTION_KIND_LABELS } from '@voce/db'

import {
  componiAtto,
  raccogliCitazioni,
  trovaDestinatario,
} from '@/lib/ai/dossier'
import { MODEL_DOSSIER, getOpenAI, stimaCostoEuro } from '@/lib/ai/openai'
import { NOTE_REVISIONE_FINE, NOTE_REVISIONE_INIZIO } from '@/lib/ai/atti/accesso-civico'
import { riesameAccessoCivico } from '@/lib/ai/atti/riesame-accesso-civico'
import { sollecito } from '@/lib/ai/atti/sollecito'
import type { AttoPrecedente, ContestoAtto, ModelloAtto } from '@/lib/ai/atti/tipi'
import { giorniInteriTra } from '@/lib/scadenze/termini'
import { createServiceClient } from '@/lib/supabase/service'
import { logAiUsage, logger } from '@/lib/utils/logger'

/**
 * I modelli disponibili per gli atti di seguito.
 *
 * `Partial` è voluto: la catena definita in SQL da `action_follow_up_kind()`
 * arriva fino a `segnalazione_difensore_civico`, per il quale un modello non
 * esiste ancora. Quando la catena chiede un atto di cui non sappiamo scrivere
 * il testo, questo modulo si ferma e lo dice nel log — non improvvisa un atto
 * generico indirizzato a un organo che in molti comuni non è nemmeno
 * costituito.
 */
const MODELLI_SEGUITO: Partial<Record<ActionKind, ModelloAtto>> = {
  sollecito,
  riesame_accesso_civico: riesameAccessoCivico,
}

/**
 * Controlli deterministici sul testo prodotto, per tipo di atto.
 *
 * Il «CAMPI OBBLIGATORI» scritto nel prompt è una richiesta al modello, non una
 * garanzia. Qui ci sono le poche voci verificabili con certezza da una regola:
 * senza di esse l'atto non è incompleto in modo elegante, è inutilizzabile —
 * un sollecito che non richiama la norma su cui si fonda non è un sollecito.
 * Un atto incompleto salvato come bozza è peggio di nessun atto, perché chi lo
 * legge lo crede già filtrato.
 */
const CONTROLLI: Partial<Record<ActionKind, { descrizione: string; regola: RegExp }[]>> = {
  sollecito: [
    { descrizione: 'oggetto dell\'atto', regola: /oggetto\s*:/i },
    { descrizione: 'blocco destinatario', regola: /destinatario\s*:/i },
    {
      descrizione: 'richiamo all\'art. 2, comma 9-ter, L. 241/1990',
      regola: /comma\s*9[-‑–\s]?ter/i,
    },
    { descrizione: 'formula di sottoscrizione', regola: /sottoscritt/i },
    { descrizione: 'blocco firma', regola: /firma/i },
  ],
  riesame_accesso_civico: [
    { descrizione: 'oggetto dell\'atto', regola: /oggetto\s*:/i },
    { descrizione: 'blocco destinatario', regola: /destinatario\s*:/i },
    {
      descrizione: 'richiamo all\'art. 5, comma 7, D.Lgs. 33/2013',
      regola: /comma\s*7[^\n]{0,60}33\/2013|33\/2013[^\n]{0,60}comma\s*7/i,
    },
    { descrizione: 'formula di sottoscrizione', regola: /sottoscritt/i },
    { descrizione: 'blocco firma', regola: /firma/i },
  ],
}

/** Lunghezza minima sotto la quale il testo non è un atto, è un frammento. */
const LUNGHEZZA_MINIMA = 500

/** Quanto testo dell'atto originario si passa al modello. */
const LIMITE_CORPO_PRECEDENTE = 6000

export type MotivoNessunSeguito =
  | 'atto_non_trovato'
  | 'stato_non_idoneo'
  | 'gia_generato'
  | 'senza_scadenza'
  | 'termine_non_scaduto'
  | 'nessun_seguito_previsto'
  | 'modello_mancante'
  | 'gruppo_sintetico'
  | 'gruppo_in_revisione'
  | 'nessuna_citazione'
  | 'generazione_fallita'

export interface EsitoSeguito {
  /** True solo se una nuova bozza è stata salvata. */
  generato: boolean
  /** Id del nuovo atto, quando è stato creato. */
  nuovoAttoId: string | null
  /** Tipo del nuovo atto, quando la catena ne prevedeva uno. */
  kind: ActionKind | null
  /** Perché non è stato generato niente. Null quando è andata bene. */
  motivo: MotivoNessunSeguito | null
}

function esitoNegativo(motivo: MotivoNessunSeguito, kind: ActionKind | null = null): EsitoSeguito {
  return { generato: false, nuovoAttoId: null, kind, motivo }
}

/** Data in italiano, senza orario: è la forma con cui entra in un atto. */
function dataItaliana(valore: string | Date): string {
  const data = valore instanceof Date ? valore : new Date(valore)
  return data.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * Il corpo dell'atto originario, ripulito da tutto ciò che l'applicazione gli
 * ha aggiunto in coda.
 *
 * Restano fuori tre cose, e ognuna per un motivo suo:
 *  - le note per la revisione, che sono appunti interni e non parte dell'atto;
 *  - l'elenco delle segnalazioni richiamate, che il nuovo atto ricostruisce da
 *    sé con i numeri aggiornati: due numerazioni diverse nello stesso fascicolo
 *    fanno cadere ogni rimando [n];
 *  - i riferimenti normativi e il disclaimer, che l'applicazione riaggiunge in
 *    fondo al nuovo atto e che raddoppiati sarebbero solo rumore.
 */
export function estraiCorpoAtto(markdown: string | null): string | null {
  if (!markdown) return null

  let testo = markdown

  const inizioNote = testo.indexOf(NOTE_REVISIONE_INIZIO)
  if (inizioNote !== -1) {
    const fineNote = testo.indexOf(NOTE_REVISIONE_FINE, inizioNote)
    testo =
      fineNote !== -1
        ? testo.slice(0, inizioNote) + testo.slice(fineNote + NOTE_REVISIONE_FINE.length)
        : testo.slice(0, inizioNote)
  }

  for (const intestazione of ['## Segnalazioni richiamate', '## Riferimenti normativi']) {
    const posizione = testo.indexOf(intestazione)
    if (posizione !== -1) testo = testo.slice(0, posizione)
  }

  testo = testo
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n\s*-{3,}\s*$/, '')
    .trim()

  if (testo.length > LIMITE_CORPO_PRECEDENTE) {
    testo = `${testo.slice(0, LIMITE_CORPO_PRECEDENTE).trimEnd()}\n\n[testo troncato: vedi la copia allegata]`
  }

  return testo.length > 0 ? testo : null
}

/** Le voci obbligatorie che mancano nel testo prodotto. */
function vociMancanti(kind: ActionKind, corpo: string): string[] {
  const mancanti: string[] = []

  if (corpo.trim().length < LUNGHEZZA_MINIMA) {
    mancanti.push('testo troppo breve per essere un atto')
  }

  for (const controllo of CONTROLLI[kind] ?? []) {
    if (!controllo.regola.test(corpo)) mancanti.push(controllo.descrizione)
  }

  return mancanti
}

/**
 * Prepara l'atto che viene dopo un atto rimasto senza risposta.
 *
 * La chiama il job giornaliero delle scadenze. È idempotente: chiamarla due
 * volte sullo stesso atto produce un solo seguito.
 */
export async function generaAttoDiSeguito(actionId: string): Promise<EsitoSeguito> {
  const sb = createServiceClient()
  const log = logger.child({ action_id: actionId, job: 'scadenze' })

  const { data: atto, error: erroreAtto } = await sb
    .from('actions')
    // Una sola stringa letterale, non una concatenazione: supabase-js ricava i
    // tipi delle colonne dal testo del `select`, e un `'a' + 'b'` per lui è un
    // `string` qualunque — da lì in poi ogni campo diventa `GenericStringError`.
    .select('id, cluster_id, kind, status, title, recipient, body_markdown, submitted_at, deadline_at, deadline_days, deadline_basis, follow_up_generated_at, is_synthetic')
    .eq('id', actionId)
    .maybeSingle()

  if (erroreAtto || !atto) {
    log.error('seguito.atto_non_trovato', { messaggio: erroreAtto?.message })
    return esitoNegativo('atto_non_trovato')
  }

  // Solo gli atti partiti e ancora senza risposta. `risposta_ricevuta` esce di
  // scena da sola: se l'amministrazione ha risposto, sollecitarla è un errore
  // che si legge a occhio nudo e che brucia la credibilità del gruppo.
  if (atto.status !== 'inviata') return esitoNegativo('stato_non_idoneo')
  if (atto.is_synthetic) return esitoNegativo('gruppo_sintetico')
  if (atto.follow_up_generated_at) return esitoNegativo('gia_generato')
  if (!atto.deadline_at || !atto.submitted_at) return esitoNegativo('senza_scadenza')
  if (new Date(atto.deadline_at).getTime() > Date.now()) {
    return esitoNegativo('termine_non_scaduto')
  }

  // Quale atto viene dopo lo decide il database: la catena è definita una volta
  // sola in `action_follow_up_kind()`, e riscriverla qui in TypeScript
  // significherebbe avere due catene che prima o poi divergono.
  const { data: kindSeguito, error: erroreCatena } = await sb.rpc('action_follow_up_kind', {
    kind: atto.kind,
  })

  if (erroreCatena) {
    log.error('seguito.catena_non_letta', { messaggio: erroreCatena.message })
    return esitoNegativo('generazione_fallita')
  }

  if (!kindSeguito) {
    // Non è un errore: per un esposto in Procura, per un dossier alla stampa e
    // per la segnalazione al difensore civico la catena si ferma di proposito.
    log.info('seguito.nessun_seguito_previsto', { kind: atto.kind })
    return esitoNegativo('nessun_seguito_previsto')
  }

  const modello = MODELLI_SEGUITO[kindSeguito]
  if (!modello) {
    log.warn('seguito.modello_mancante', {
      kind: atto.kind,
      kind_seguito: kindSeguito,
      nota:
        'la catena prevede questo atto ma non esiste un modello con riferimenti ' +
        'verificati: nessuna bozza viene creata',
    })
    return esitoNegativo('modello_mancante', kindSeguito)
  }

  const { data: gruppo, error: erroreGruppo } = await sb
    .from('clusters')
    .select('id, title, summary, category, city, neighborhood, citizens_count, reports_count, is_synthetic, review_flag, review_reason')
    .eq('id', atto.cluster_id)
    .maybeSingle()

  if (erroreGruppo || !gruppo) {
    log.error('seguito.gruppo_non_trovato', {
      cluster_id: atto.cluster_id,
      messaggio: erroreGruppo?.message,
    })
    return esitoNegativo('generazione_fallita', kindSeguito)
  }

  if (gruppo.is_synthetic) return esitoNegativo('gruppo_sintetico', kindSeguito)

  /**
   * Gruppo in revisione (PLAN2 §5.2): controllato PRIMA di provare a inserire.
   * Il trigger `actions_before_insert_review` lancerebbe un'eccezione, e
   * un'eccezione nei log è indistinguibile da un guasto vero. Qui il flag è una
   * decisione, non un incidente: riprende da sola quando un amministratore lo
   * toglie.
   */
  if (gruppo.review_flag) {
    log.warn('seguito.gruppo_in_revisione', {
      cluster_id: gruppo.id,
      motivo: gruppo.review_reason,
    })
    return esitoNegativo('gruppo_in_revisione', kindSeguito)
  }

  const citazioni = await raccogliCitazioni(gruppo.id)
  if (citazioni.length === 0) {
    log.warn('seguito.nessuna_citazione', { cluster_id: gruppo.id })
    return esitoNegativo('nessuna_citazione', kindSeguito)
  }

  // Lucchetto: da qui in poi nessun'altra esecuzione può generare lo stesso
  // seguito. L'update è condizionato su `follow_up_generated_at is null`, quindi
  // vince una sola delle esecuzioni in corsa.
  const { data: bloccato, error: erroreLucchetto } = await sb
    .from('actions')
    .update({ follow_up_generated_at: new Date().toISOString() })
    .eq('id', atto.id)
    .is('follow_up_generated_at', null)
    .select('id')
    .maybeSingle()

  if (erroreLucchetto) {
    log.error('seguito.lucchetto_fallito', { messaggio: erroreLucchetto.message })
    return esitoNegativo('generazione_fallita', kindSeguito)
  }

  if (!bloccato) return esitoNegativo('gia_generato', kindSeguito)

  try {
    const destinatario = await trovaDestinatario(gruppo.city, modello.ruoloDestinatario)

    const attoPrecedente: AttoPrecedente = {
      kind: atto.kind,
      etichetta: ACTION_KIND_LABELS[atto.kind],
      titolo: atto.title,
      destinatario: atto.recipient,
      inviatoIl: dataItaliana(atto.submitted_at),
      scadutoIl: dataItaliana(atto.deadline_at),
      giorniTermine: atto.deadline_days ?? 0,
      baseTermine: atto.deadline_basis ?? 'termine non registrato',
      giorniDallaScadenza: giorniInteriTra(atto.deadline_at, new Date()),
      corpo: estraiCorpoAtto(atto.body_markdown),
    }

    const contesto: ContestoAtto = {
      cluster: {
        titolo: gruppo.title,
        riassunto: gruppo.summary,
        categoria: gruppo.category,
        citta: gruppo.city,
        quartiere: gruppo.neighborhood,
        cittadini: gruppo.citizens_count,
        segnalazioni: gruppo.reports_count,
      },
      citazioni,
      destinatario: destinatario?.etichetta ?? null,
      attoPrecedente,
    }

    const corpo = await scriviAtto(modello, contesto, gruppo.id, log)

    const { data: creato, error: erroreInsert } = await sb
      .from('actions')
      .insert({
        cluster_id: gruppo.id,
        kind: modello.kind,
        // 'bozza', sempre. Nessun percorso di questo file porta a 'inviata':
        // il termine scaduto rende l'atto opportuno, non firmato.
        status: 'bozza',
        title: modello.titolo(contesto),
        body_markdown: componiAtto(corpo, contesto, modello),
        recipient: destinatario?.etichetta ?? null,
        recipient_endpoint_id: destinatario?.id ?? null,
        signatures_target: modello.firmeObiettivo,
        follow_up_of_action_id: atto.id,
      })
      .select('id')
      .single()

    if (erroreInsert || !creato) {
      throw new Error(erroreInsert?.message ?? 'insert senza riga di ritorno')
    }

    log.info('seguito.atto_creato', {
      cluster_id: gruppo.id,
      kind: modello.kind,
      nuovo_action_id: creato.id,
    })

    return { generato: true, nuovoAttoId: creato.id, kind: modello.kind, motivo: null }
  } catch (errore) {
    // Il lucchetto va tolto: un seguito mancato si recupera domani, e lasciarlo
    // chiuso significherebbe che quel gruppo non riceve più alcun seguito, per
    // sempre, senza che nessuno se ne accorga.
    const { error: erroreSblocco } = await sb
      .from('actions')
      .update({ follow_up_generated_at: null })
      .eq('id', atto.id)

    log.error('seguito.generazione_fallita', {
      cluster_id: atto.cluster_id,
      kind_seguito: kindSeguito,
      messaggio: errore instanceof Error ? errore.message : String(errore),
      lucchetto_rimosso: !erroreSblocco,
      errore_sblocco: erroreSblocco?.message ?? null,
    })

    return esitoNegativo('generazione_fallita', kindSeguito)
  }
}

/**
 * Chiede il testo al modello e lo controlla prima di restituirlo.
 *
 * Due tentativi, non di più: se al secondo giro mancano ancora le voci
 * obbligatorie non è un caso sfortunato, è un prompt da correggere, e insistere
 * costa soldi senza cambiare l'esito. Il fallimento risale al chiamante, che
 * toglie il lucchetto e lascia riprovare il giorno dopo.
 */
async function scriviAtto(
  modello: ModelloAtto,
  contesto: ContestoAtto,
  clusterId: string,
  log: ReturnType<typeof logger.child>,
): Promise<string> {
  const openai = getOpenAI()
  let ultimeMancanze: string[] = []

  for (let tentativo = 1; tentativo <= 2; tentativo++) {
    const promemoria =
      ultimeMancanze.length > 0
        ? `\n\nLA VERSIONE PRECEDENTE È STATA SCARTATA perché mancavano: ${ultimeMancanze.join(
            '; ',
          )}. Riscrivi l'atto completo includendo quelle parti.`
        : ''

    const completamento = await openai.chat.completions.create({
      model: MODEL_DOSSIER,
      messages: [
        { role: 'system', content: modello.systemPrompt },
        { role: 'user', content: `${modello.userPrompt(contesto)}${promemoria}` },
      ],
      temperature: 0.2,
    })

    logAiUsage({
      model: MODEL_DOSSIER,
      operation: `atto_seguito:${modello.kind}`,
      input_tokens: completamento.usage?.prompt_tokens ?? 0,
      output_tokens: completamento.usage?.completion_tokens ?? 0,
      cost_eur: stimaCostoEuro(
        MODEL_DOSSIER,
        completamento.usage?.prompt_tokens ?? 0,
        completamento.usage?.completion_tokens ?? 0,
      ),
      cluster_id: clusterId,
    })

    const corpo = completamento.choices[0]?.message.content?.trim()
    if (!corpo) {
      ultimeMancanze = ['il modello non ha prodotto testo']
      continue
    }

    const mancanti = vociMancanti(modello.kind, corpo)
    if (mancanti.length === 0) return corpo

    ultimeMancanze = mancanti
    log.warn('seguito.atto_incompleto', {
      cluster_id: clusterId,
      kind: modello.kind,
      tentativo,
      mancanti,
    })
  }

  throw new Error(`atto incompleto dopo due tentativi: mancano ${ultimeMancanze.join('; ')}`)
}
