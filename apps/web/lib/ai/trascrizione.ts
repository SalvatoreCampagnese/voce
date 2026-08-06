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
 * Estensioni accettate dall'API di trascrizione di OpenAI.
 *
 * L'elenco NON è decorativo: l'API guarda l'estensione del nome file, non il
 * `Content-Type`. Un file perfettamente valido con l'estensione sbagliata viene
 * respinto con `400 Unsupported file format`.
 */
const ESTENSIONI_ACCETTATE = new Set([
  'flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'ogg', 'wav', 'webm',
])

/**
 * Estensioni che indicano un contenitore già accettato, con un altro nome.
 *
 * QUESTA RIGA È COSTATA UN VOCALE VERO.
 * Telegram consegna i messaggi vocali con `file_path` che finisce in **`.oga`**:
 * è Ogg/Opus, cioè esattamente ciò che l'API sa decodificare, ma quel nome non
 * è nella sua lista e la richiesta torna `400 Unsupported file format oga`.
 * Il risultato, in produzione: ogni singolo vocale falliva, e al cittadino
 * arrivava «non riesco ad ascoltare» — cioè la funzione che PLAN2 §2.1 chiama
 * «la più utile di tutte» non funzionava per nessuno.
 *
 * Si rinomina solo per la chiamata: nell'archivio il file conserva la sua
 * estensione vera, perché è quella giusta per il file che c'è davvero.
 */
const ALIAS_ESTENSIONE: Record<string, string> = {
  oga: 'ogg',
  opus: 'ogg',
  mpeg4: 'mp4',
  m4b: 'm4a',
}

/**
 * Il nome da mandare a OpenAI: stessa base, estensione che l'API riconosce.
 *
 * Quando l'estensione non è né accettata né traducibile si ripiega su `ogg`
 * **solo** se il mime type dichiara un contenitore Ogg; altrimenti si lascia il
 * nome com'è e si lascia decidere all'API. Rinominare alla cieca un formato che
 * non conosciamo significherebbe chiedere al decodificatore sbagliato di aprire
 * il file, e l'errore che ne esce è molto più difficile da leggere di un 400.
 */
export function nomeFilePerTrascrizione(nomeFile: string, mimeType: string): string {
  const punto = nomeFile.lastIndexOf('.')
  const base = punto > 0 ? nomeFile.slice(0, punto) : nomeFile
  const estensione = punto > 0 ? nomeFile.slice(punto + 1).toLowerCase() : ''

  if (ESTENSIONI_ACCETTATE.has(estensione)) return nomeFile

  const alias = ALIAS_ESTENSIONE[estensione]
  if (alias) return `${base}.${alias}`

  if (mimeType.toLowerCase().includes('ogg')) return `${base}.ogg`

  return nomeFile
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
    // Il nome va normalizzato: l'API sceglie il decodificatore dall'estensione
    // e rifiuta `.oga`, che è proprio ciò che manda Telegram. Vedi
    // `nomeFilePerTrascrizione`.
    const nomePerApi = nomeFilePerTrascrizione(audio.nomeFile, audio.mimeType)
    const file = await toFile(audio.contenuto, nomePerApi, { type: audio.mimeType })

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
