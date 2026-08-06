/**
 * Scarico dei file allegati a un messaggio Telegram (PLAN2 §2.1, §2.3).
 *
 * Telegram non consegna il contenuto dentro l'update: manda un `file_id`, e il
 * file va chiesto in due passi — `getFile` per sapere dove sta, poi il download
 * vero e proprio. Il collegamento resta valido circa un'ora.
 *
 * Due cose che questo modulo protegge:
 *
 * 1. **L'URL di download contiene il token del bot.** Non finisce mai in un log,
 *    in un messaggio d'errore o in una colonna. Chi ottiene quel token può
 *    scrivere a nome di VOCE a tutti i cittadini che ci hanno parlato.
 * 2. **La dimensione si controlla due volte**: prima su `file_size` dichiarato
 *    da Telegram, poi sui byte davvero arrivati. Fidarsi solo del dichiarato
 *    vuol dire far decidere a chi manda il file quanta memoria consumiamo.
 *
 * Non lancia eccezioni per i casi previsti (file troppo grande, non
 * disponibile): restituisce un esito che il chiamante trasforma in una risposta
 * onesta al cittadino. Un vocale che non si riesce a scaricare deve produrre
 * una frase, non un 500.
 */

import { z } from 'zod'

import { serverEnv } from '@/lib/config/env'
import { MAX_MEDIA_BYTES } from '@/lib/config/constants'
import { logger } from '@/lib/utils/logger'

const API = 'https://api.telegram.org'

/** Risposta di `getFile`. Ogni input esterno passa da uno schema prima dell'uso. */
const RispostaGetFile = z.object({
  ok: z.boolean(),
  result: z
    .object({
      file_id: z.string(),
      file_unique_id: z.string(),
      file_size: z.number().int().nonnegative().optional(),
      file_path: z.string().optional(),
    })
    .optional(),
  description: z.string().optional(),
})

export interface FileTelegram {
  /** Contenuto del file. Resta in memoria: non tocca il disco della funzione. */
  contenuto: Uint8Array<ArrayBuffer>
  bytes: number
  mimeType: string
  /** Estensione senza punto, dedotta dal percorso Telegram. */
  estensione: string
  /**
   * Identificatore stabile del file lato Telegram. Rende deterministico il
   * percorso nello storage e quindi idempotente il rinvio dello stesso update.
   */
  fileUniqueId: string
}

export type EsitoScarico =
  | { ok: true; file: FileTelegram }
  | { ok: false; motivo: 'troppo_grande' | 'non_disponibile' }

/** Estensioni note, per non salvare file senza nome nel bucket. */
const MIME_PER_ESTENSIONE: Record<string, string> = {
  oga: 'audio/ogg',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  wav: 'audio/wav',
  webm: 'audio/webm',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
}

function estensioneDa(filePath: string, ripiego: string): string {
  const pezzo = filePath.split('.').pop()?.toLowerCase() ?? ''
  return /^[a-z0-9]{1,5}$/.test(pezzo) ? pezzo : ripiego
}

/**
 * Scarica un file di Telegram a partire dal suo `file_id`.
 *
 * @param fileId    identificatore ricevuto nell'update
 * @param opzioni.mimeDichiarato  il `mime_type` che Telegram mette sull'oggetto
 *   Voice o Audio. Le foto (PhotoSize) non ce l'hanno: lì si deduce dal percorso.
 * @param opzioni.estensioneRipiego estensione da usare se il percorso non ne ha
 */
export async function scaricaFileTelegram(
  fileId: string,
  opzioni: { mimeDichiarato?: string | null; estensioneRipiego?: string } = {},
): Promise<EsitoScarico> {
  const estensioneRipiego = opzioni.estensioneRipiego ?? 'bin'

  // --- 1. Dove sta il file --------------------------------------------------
  let descrittore: z.infer<typeof RispostaGetFile>
  try {
    const risposta = await fetch(
      `${API}/bot${serverEnv.TELEGRAM_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`,
      { method: 'GET' },
    )
    descrittore = RispostaGetFile.parse(await risposta.json())
  } catch (errore) {
    // Nessun dettaglio dell'URL nel log: conterrebbe il token del bot.
    logger.warn('telegram.getfile_fallito', { error: errore })
    return { ok: false, motivo: 'non_disponibile' }
  }

  const meta = descrittore.result
  if (!descrittore.ok || !meta?.file_path) {
    logger.warn('telegram.getfile_senza_percorso', {
      descrizione: descrittore.description?.slice(0, 200),
    })
    return { ok: false, motivo: 'non_disponibile' }
  }

  // Telegram stessa non consegna file oltre i 20 MB: qui il limite nostro è più
  // basso o uguale, e serve a non tirare in memoria di una funzione serverless
  // qualcosa che non riusciremmo comunque a trattare.
  if (meta.file_size !== undefined && meta.file_size > MAX_MEDIA_BYTES) {
    logger.info('telegram.file_troppo_grande', {
      file_unique_id: meta.file_unique_id,
      bytes: meta.file_size,
      limite: MAX_MEDIA_BYTES,
    })
    return { ok: false, motivo: 'troppo_grande' }
  }

  // --- 2. Il file -----------------------------------------------------------
  let contenuto: Uint8Array<ArrayBuffer>
  try {
    const scarico = await fetch(
      `${API}/file/bot${serverEnv.TELEGRAM_BOT_TOKEN}/${meta.file_path}`,
    )
    if (!scarico.ok) {
      logger.warn('telegram.download_fallito', {
        file_unique_id: meta.file_unique_id,
        status: scarico.status,
      })
      return { ok: false, motivo: 'non_disponibile' }
    }
    contenuto = new Uint8Array(await scarico.arrayBuffer())
  } catch (errore) {
    logger.warn('telegram.download_eccezione', {
      file_unique_id: meta.file_unique_id,
      error: errore,
    })
    return { ok: false, motivo: 'non_disponibile' }
  }

  // Secondo controllo, sui byte veri: `file_size` è una dichiarazione, non una
  // garanzia, e un file vuoto manderebbe il modello a trascrivere il nulla.
  if (contenuto.byteLength === 0) {
    return { ok: false, motivo: 'non_disponibile' }
  }
  if (contenuto.byteLength > MAX_MEDIA_BYTES) {
    logger.info('telegram.file_troppo_grande_reale', {
      file_unique_id: meta.file_unique_id,
      bytes: contenuto.byteLength,
    })
    return { ok: false, motivo: 'troppo_grande' }
  }

  const estensione = estensioneDa(meta.file_path, estensioneRipiego)
  const mimeType =
    opzioni.mimeDichiarato?.trim() ||
    MIME_PER_ESTENSIONE[estensione] ||
    'application/octet-stream'

  logger.info('telegram.file_scaricato', {
    file_unique_id: meta.file_unique_id,
    bytes: contenuto.byteLength,
    mime: mimeType,
  })

  return {
    ok: true,
    file: {
      contenuto,
      bytes: contenuto.byteLength,
      mimeType,
      estensione,
      fileUniqueId: meta.file_unique_id,
    },
  }
}
