import { zodResponseFormat } from 'openai/helpers/zod'

import { createServiceClient } from '@/lib/supabase/service'
import { logger, logAiUsage } from '@/lib/utils/logger'
import { MODEL_TRIAGE, getOpenAI, stimaCostoEuro } from '@/lib/ai/openai'
import {
  RISPOSTA_DETTAGLIO_SYSTEM_PROMPT,
  RispostaDettaglioSchema,
  type RispostaDettaglioOutput,
} from '@/lib/ai/prompts'

/**
 * Integrazione di una segnalazione già inviata (PLAN2 §2.4).
 *
 * Il bot fa una domanda sola e precisa — «di che tipo di guasto si tratta?» — e
 * la persona risponde. Prima di questo modulo la risposta diventava una
 * segnalazione NUOVA: due righe dimezzate al posto di una completa, nessuna
 * delle due abbastanza forte da entrare in un gruppo. E il messaggio precedente
 * aveva appena promesso il contrario.
 *
 * Qui la risposta torna dove deve stare: in fondo alla segnalazione di prima,
 * che viene poi ri-smistata sul testo completo.
 */

/** Quanto della segnalazione precedente si dà al classificatore. */
const CONTESTO_CARATTERI = 1200

export interface EsitoRisposta {
  /** Il messaggio riguarda ancora la segnalazione in sospeso. */
  integra: boolean
  /** Il cittadino ha riscritto tutto: il nuovo testo prende il posto del vecchio. */
  sostituisce: boolean
}

/**
 * Decide se un messaggio è la risposta alla domanda che abbiamo fatto o un
 * racconto nuovo.
 *
 * Ripiega su `integra: true` quando il modello non risponde. Il ripiego non è
 * neutro ed è scelto: unire per sbaglio due messaggi che parlano della stessa
 * cosa produce una segnalazione un po' confusa, che una persona in moderazione
 * legge e sistema; spezzare per sbaglio il racconto di un cittadino produce due
 * segnalazioni monche che non si uniranno mai a niente, e nessuno se ne accorge.
 */
export async function classificaRisposta(input: {
  /** La domanda che abbiamo fatto. */
  domanda: string
  /** La segnalazione a cui si riferisce. */
  segnalazione: string
  /** Il messaggio appena arrivato. */
  messaggio: string
}): Promise<EsitoRisposta> {
  const openai = getOpenAI()

  try {
    const completamento = await openai.chat.completions.parse({
      model: MODEL_TRIAGE,
      messages: [
        { role: 'system', content: RISPOSTA_DETTAGLIO_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            `SEGNALAZIONE DI PRIMA:\n${input.segnalazione.slice(0, CONTESTO_CARATTERI)}`,
            '',
            `DOMANDA CHE LE ABBIAMO FATTO:\n${input.domanda}`,
            '',
            `NUOVO MESSAGGIO:\n${input.messaggio}`,
          ].join('\n'),
        },
      ],
      response_format: zodResponseFormat(RispostaDettaglioSchema, 'risposta'),
      temperature: 0,
    })

    logAiUsage({
      model: MODEL_TRIAGE,
      operation: 'classifica_risposta',
      input_tokens: completamento.usage?.prompt_tokens ?? 0,
      output_tokens: completamento.usage?.completion_tokens ?? 0,
      cost_eur: stimaCostoEuro(
        MODEL_TRIAGE,
        completamento.usage?.prompt_tokens ?? 0,
        completamento.usage?.completion_tokens ?? 0,
      ),
    })

    const parsed = completamento.choices[0]?.message.parsed as RispostaDettaglioOutput | null
    if (!parsed) return { integra: true, sostituisce: false }

    // `sostituisce` senza `integra` non vuol dire niente: se il messaggio parla
    // d'altro non può nemmeno sostituire.
    return { integra: parsed.integra, sostituisce: parsed.integra && parsed.sostituisce }
  } catch (errore) {
    logger.warn('integrazione.classificazione_fallita', {
      messaggio: errore instanceof Error ? errore.message : String(errore),
    })
    return { integra: true, sostituisce: false }
  }
}

/**
 * Scrive la risposta del cittadino dentro la segnalazione a cui appartiene.
 *
 * LA DOMANDA VIENE SALVATA INSIEME ALLA RISPOSTA, e non è un vezzo: «due mesi»
 * attaccato in fondo a un racconto non significa niente, né per il modello che
 * lo ri-smisterà né per la persona che lo leggerà in moderazione. Con la
 * domanda davanti, la stessa riga si legge da sola.
 *
 * Le parole restano del cittadino: non si riscrive, non si riassume, non si
 * corregge. Si aggiunge in fondo e si dice di chi sono.
 *
 * Restituisce `false` se la segnalazione non esiste più o se il salvataggio non
 * riesce: il chiamante in quel caso tratta il messaggio come nuovo, invece di
 * far sparire quello che una persona ha appena scritto.
 */
export async function integraSegnalazione(input: {
  reportId: string
  /** La domanda già posta, per dare senso a una risposta di due parole. */
  domanda: string | null
  /** Il testo appena arrivato, così come l'ha scritto o detto il cittadino. */
  aggiunta: string
  /** Il cittadino ha riscritto tutto: il vecchio testo va sostituito. */
  sostituisce: boolean
}): Promise<boolean> {
  const sb = createServiceClient()

  const { data: report, error: erroreLettura } = await sb
    .from('reports')
    .select('id, raw_text, status')
    .eq('id', input.reportId)
    .maybeSingle()

  if (erroreLettura || !report) {
    logger.warn('integrazione.segnalazione_non_trovata', {
      report_id: input.reportId,
      error: erroreLettura,
    })
    return false
  }

  const testo = input.sostituisce
    ? input.aggiunta
    : [
        report.raw_text,
        '',
        input.domanda ? `Domanda: ${input.domanda}` : 'Aggiunta dal cittadino:',
        input.domanda ? `Risposta del cittadino: ${input.aggiunta}` : input.aggiunta,
      ].join('\n')

  // Una segnalazione archiviata perché troppo vaga torna in coda: adesso il
  // pezzo che mancava c'è. 'nuovo' è anche la rete di sicurezza — se il
  // ri-smistamento che parte subito dopo non arriva in fondo, il cron di
  // recupero ripesca le righe 'nuovo' e lo rifà. Senza, resterebbe archiviata
  // per sempre proprio la segnalazione che il cittadino ha appena completato.
  //
  // Sugli altri stati NON si tocca niente, ed è deliberato: 'clustered' è la
  // condizione con cui `public_cluster_reports` decide cosa mostrare e cosa
  // citare in un atto. Riportare a 'nuovo' una segnalazione già pubblica
  // significherebbe farla sparire da un gruppo — e dalle prove di un esposto —
  // per tutto il tempo del ri-smistamento, e per sempre se quello fallisce.
  const nuovoStato = report.status === 'archiviato' ? { status: 'nuovo' as const } : {}

  const { error: erroreScrittura } = await sb
    .from('reports')
    .update({ raw_text: testo, ...nuovoStato })
    .eq('id', input.reportId)

  if (erroreScrittura) {
    logger.error('integrazione.salvataggio_fallito', {
      report_id: input.reportId,
      error: erroreScrittura,
    })
    return false
  }

  logger.info('integrazione.aggiunta', {
    report_id: input.reportId,
    sostituzione: input.sostituisce,
    caratteri_aggiunti: input.aggiunta.length,
  })

  return true
}
