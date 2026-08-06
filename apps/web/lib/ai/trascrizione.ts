/**
 * Trascrizione dei messaggi vocali (PLAN2 §2.1).
 *
 * È la funzione che fa entrare chi oggi resta fuori. Un anziano che ha aspettato
 * otto ore al pronto soccorso non scrive tre paragrafi: manda trenta secondi di
 * voce. Dopo questo passaggio il flusso è identico a quello testuale — la
 * trascrizione diventa `raw_text` e `triageReport()` non cambia di una riga.
 *
 * `language: 'it'` è forzato e non è una preferenza: senza, il modello scambia
 * il dialetto per un'altra lingua e restituisce una trascrizione inventata, che
 * poi finirebbe dentro un gruppo e forse dentro un atto.
 *
 * L'audio originale non passa di qui verso nessuna pagina: viene archiviato nel
 * bucket privato da `lib/media/archivio.ts`.
 */

import { APIError, toFile } from 'openai'

import {
  MODEL_TRANSCRIBE,
  getOpenAI,
  stimaCostoTrascrizione,
} from '@/lib/ai/openai'
import { logAiUsage, logger } from '@/lib/utils/logger'

export interface AudioDaTrascrivere {
  contenuto: Uint8Array
  /** Nome con estensione: l'API sceglie il decodificatore anche da questo. */
  nomeFile: string
  mimeType: string
  /** Durata dichiarata dal canale, in secondi. Serve solo a stimare il costo. */
  durataSecondi: number
  reportId?: string
}

/**
 * Frasi che i modelli di trascrizione producono sul silenzio o sul rumore, e
 * che non sono mai state dette da nessuno. Se la trascrizione è solo questo,
 * vale come vuota: meglio chiedere al cittadino di ripetere che salvare una
 * segnalazione con dentro i titoli di coda di un video.
 */
const ALLUCINAZIONI_NOTE = [
  'sottotitoli e revisione a cura di',
  'sottotitoli creati dalla comunità amara.org',
  'sottotitoli a cura di',
  'grazie per aver guardato il video',
  'grazie a tutti per aver guardato',
  'iscriviti al canale',
  'thanks for watching',
  'subtitles by',
]

function sembraVuota(testo: string): boolean {
  const normalizzato = testo.toLowerCase().replace(/\s+/g, ' ').trim()
  if (normalizzato.length < 3) return true
  // Solo punteggiatura o solo puntini: capita sui vocali muti.
  if (!/\p{L}/u.test(normalizzato)) return true
  return ALLUCINAZIONI_NOTE.some((frase) => normalizzato.includes(frase))
}

/**
 * Esito della trascrizione. I tre casi NON sono la stessa cosa e il chiamante
 * deve poterli distinguere:
 *
 * - `ok`      c'è un racconto da salvare;
 * - `vuota`   l'audio non contiene parlato utilizzabile — è successo qualcosa
 *             dalla parte del cittadino (rumore, microfono coperto, silenzio),
 *             e ha senso chiedergli di ripetere;
 * - `guasto`  il servizio di trascrizione non ha risposto: quota finita,
 *             timeout, rete, errore HTTP. Non è successo niente dalla parte del
 *             cittadino.
 *
 * Finché i due ultimi casi tornavano entrambi `null`, un guasto nostro veniva
 * raccontato alla persona come «non ho capito» — cioè come colpa sua — e il suo
 * vocale veniva buttato. È il fallimento peggiore previsto dal contratto §8.
 */
export type EsitoTrascrizione =
  | { stato: 'ok'; testo: string; lingua?: string | null }
  | { stato: 'vuota' }
  /** `motivo` è per i log, non per il cittadino: non va mai mostrato. */
  | { stato: 'guasto'; motivo: string }

/**
 * Trascrive un messaggio vocale.
 *
 * @returns l'esito distinto fra testo, audio senza parlato e guasto del
 *   servizio. Non lancia: chi chiama sta rispondendo a una persona in attesa e
 *   decide lui cosa dirle. Fingere di aver capito è peggio; dare la colpa a chi
 *   ha parlato quando il guasto è nostro, anche.
 */
export async function trascriviAudio(audio: AudioDaTrascrivere): Promise<EsitoTrascrizione> {
  const log = logger.child({ report_id: audio.reportId ?? null })

  try {
    const file = await toFile(audio.contenuto, audio.nomeFile, { type: audio.mimeType })

    const risposta = await getOpenAI().audio.transcriptions.create({
      model: MODEL_TRANSCRIBE,
      file,
      language: 'it',
      // Il modello scrive meglio i nomi che si aspetta di sentire. Il testo qui
      // dentro NON entra nella trascrizione: orienta solo l'ortografia.
      prompt:
        'Segnalazione civica in italiano, anche in dialetto. Possibili riferimenti a vie, quartieri, ospedali, scuole, autobus, rifiuti, buche, lampioni.',
    })

    // Il costo si paga sulla durata dell'audio, non sui token: senza questa riga
    // la spesa dei vocali si scoprirebbe solo a fine mese.
    logAiUsage({
      model: MODEL_TRANSCRIBE,
      operation: 'trascrizione',
      input_tokens: 0,
      output_tokens: 0,
      cost_eur: stimaCostoTrascrizione(audio.durataSecondi),
      report_id: audio.reportId,
    })

    const testo = (risposta.text ?? '').trim()

    if (sembraVuota(testo)) {
      log.info('trascrizione.vuota', {
        duration_seconds: audio.durataSecondi,
        bytes: audio.contenuto.byteLength,
      })
      return { stato: 'vuota' }
    }

    log.info('trascrizione.completata', {
      duration_seconds: audio.durataSecondi,
      caratteri: testo.length,
    })

    // `languages` arriva solo da alcuni modelli e noi imponiamo comunque
    // `language: 'it'`: è un'informazione per i log, non una decisione.
    return { stato: 'ok', testo, lingua: risposta.languages?.[0]?.code ?? null }
  } catch (errore) {
    // Qui dentro finiscono sia gli errori HTTP (l'SDK OpenAI lancia `APIError`
    // per ogni risposta fuori dal 2xx) sia i guasti di rete e i timeout
    // (`APIConnectionError`, che di `APIError` è sottoclasse con `status`
    // indefinito). Nessuno di questi è un audio muto.
    const motivo =
      errore instanceof APIError
        ? `openai_${errore.status ?? 'connessione'}${errore.code ? `_${errore.code}` : ''}`
        : 'eccezione'

    log.error('trascrizione.guasto', {
      duration_seconds: audio.durataSecondi,
      bytes: audio.contenuto.byteLength,
      motivo,
      error: errore,
    })

    return { stato: 'guasto', motivo }
  }
}
