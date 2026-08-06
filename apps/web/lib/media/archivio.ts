/**
 * Archiviazione di vocali e foto nel bucket PRIVATO (PLAN2 §2.1, §2.3).
 *
 * Questo modulo mette il file in `STORAGE_BUCKET_MEDIA` e ne registra una riga
 * in `report_media`. Non fa altro, e soprattutto **non espone niente**:
 *
 * - non produce URL pubblici e non contiene `getPublicUrl`;
 * - non produce nemmeno signed URL: se un giorno serviranno a un moderatore,
 *   andranno generate nel percorso di amministrazione, con un tempo di scadenza
 *   corto e un motivo tracciato;
 * - `report_media` non ha e non deve avere una vista pubblica.
 *
 * Il perché è nello schema: un messaggio vocale è un dato biometrico ai sensi
 * dell'art. 9 GDPR — identifica chi parla anche senza nome. Una foto scattata in
 * strada contiene volti di passanti che non hanno mai scritto a VOCE, targhe e
 * numeri civici. Ciò che prosegue nel flusso civico è la trascrizione o la
 * descrizione; l'originale resta fermo qui.
 *
 * L'archiviazione avviene DOPO che la segnalazione è già salvata e il cittadino
 * ha già ricevuto risposta: se fallisce, si perde l'allegato ma non il racconto,
 * che è la parte che conta.
 */

import { createServiceClient } from '@/lib/supabase/service'
import { STORAGE_BUCKET_MEDIA } from '@/lib/config/constants'
import { logger } from '@/lib/utils/logger'

export interface MediaDaArchiviare {
  reportId: string
  kind: 'audio' | 'foto'
  /**
   * Il parametro `ArrayBuffer` non è pedanteria: senza, TypeScript ammette anche
   * una vista su `SharedArrayBuffer`, che `Blob` non accetta. Dichiararlo qui
   * evita un cast a ogni chiamata.
   */
  contenuto: Uint8Array<ArrayBuffer>
  mimeType: string
  estensione: string
  /**
   * Chiave stabile del file lato canale (per Telegram: `file_unique_id`).
   * Rende deterministico il percorso: se lo stesso update viene rinviato, il
   * secondo passaggio sovrascrive lo stesso oggetto invece di creare un
   * doppione — cioè un cittadino che conterebbe due volte dentro un gruppo.
   */
  chiave: string
  durataSecondi?: number | null
  /** Solo per i vocali: l'unico contenuto dell'audio che prosegue nel flusso. */
  trascrizione?: string | null
  /** Solo per le foto: la descrizione prodotta dal modello con visione. */
  descrizione?: string | null
}

/**
 * Carica il file nel bucket privato e registra la riga in `report_media`.
 *
 * @returns il percorso nello storage, oppure `null` se qualcosa è fallito.
 *   Non lancia: il chiamante sta girando dopo la risposta HTTP e un'eccezione
 *   lì dentro non aiuta nessuno. L'errore però si logga sempre, con report_id.
 */
export async function archiviaMedia(media: MediaDaArchiviare): Promise<string | null> {
  const sb = createServiceClient()
  const log = logger.child({ report_id: media.reportId })

  // Percorso: una cartella per segnalazione. Serve anche alla cancellazione —
  // `delete_citizen_account()` accoda in `storage_deletions` i percorsi dei
  // media di quella persona, e averli raggruppati rende il lavoro verificabile.
  const percorso = `${media.reportId}/${media.kind}-${media.chiave}.${media.estensione}`

  const { error: erroreUpload } = await sb.storage
    .from(STORAGE_BUCKET_MEDIA)
    .upload(percorso, new Blob([media.contenuto], { type: media.mimeType }), {
      contentType: media.mimeType,
      // Sovrascrivere è voluto: stesso file, stesso percorso, stesso contenuto.
      // Senza, il rinvio dello stesso update lascerebbe un errore "già esiste"
      // e la riga in report_media non verrebbe scritta.
      upsert: true,
    })

  if (erroreUpload) {
    log.error('media.upload_fallito', {
      kind: media.kind,
      bytes: media.contenuto.byteLength,
      error: erroreUpload,
    })
    return null
  }

  const { error: erroreRiga } = await sb.from('report_media').upsert(
    {
      report_id: media.reportId,
      kind: media.kind,
      storage_path: percorso,
      mime_type: media.mimeType,
      bytes: media.contenuto.byteLength,
      duration_seconds: media.durataSecondi ?? null,
      transcript: media.trascrizione ?? null,
      description: media.descrizione ?? null,
    },
    { onConflict: 'report_id,storage_path' },
  )

  if (erroreRiga) {
    // Il file è nel bucket ma nessuna riga lo collega alla segnalazione: senza
    // riga, `delete_citizen_account()` non lo troverà mai e il diritto all'oblio
    // resterebbe zoppo. Va visto, non sepolto.
    log.error('media.riga_non_registrata', {
      kind: media.kind,
      storage_path: percorso,
      error: erroreRiga,
    })
    return null
  }

  log.info('media.archiviato', {
    kind: media.kind,
    bytes: media.contenuto.byteLength,
    duration_seconds: media.durataSecondi ?? null,
  })

  return percorso
}
