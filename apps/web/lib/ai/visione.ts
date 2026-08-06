/**
 * Descrizione delle foto inviate dai cittadini (PLAN2 §2.3).
 *
 * Una foto di una buca, di un palo divelto o di una perdita d'acqua dice più di
 * tre paragrafi, ed è una prova. La descrizione prodotta qui entra nel testo su
 * cui si calcola l'embedding: ai fini del raggruppamento **una foto vale come
 * una segnalazione**.
 *
 * ─── REGOLA DI PUBBLICAZIONE, DA NON AGGIRARE ──────────────────────────────
 * In pagina pubblica non compare MAI l'originale, solo questa descrizione.
 * Oscurare volti e targhe richiederebbe una libreria di computer vision che in
 * questo repo non esiste, e nessuna dipendenza nuova è ammessa. Finché non c'è,
 * si pubblica solo il testo. Non costruire nessun percorso che serva il file:
 * niente `getPublicUrl`, niente signed URL in una pagina, niente proxy.
 *
 * E il riconoscimento facciale — anche solo per oscurare — è nella lista di ciò
 * che VOCE non costruisce (PLAN2 §7). Non è una scorciatoia disponibile.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Il prompt vincola il modello a descrivere il degrado e non le persone: chi
 * passa per strada mentre qualcuno fotografa una buca non ha scritto a VOCE e
 * non poteva acconsentire a finire in un nostro archivio testuale.
 */

import { z } from 'zod'
import { zodResponseFormat } from 'openai/helpers/zod'

import { MODEL_VISION, getOpenAI, stimaCostoEuro } from '@/lib/ai/openai'
import { logAiUsage, logger } from '@/lib/utils/logger'

const FotoSchema = z.object({
  descrizione: z
    .string()
    .describe('Cosa mostra la foto, in due o tre frasi, solo fatti visibili'),
  tipo_degrado: z
    .string()
    .nullable()
    .describe('Il tipo di problema visibile, in poche parole. null se non se ne vede nessuno.'),
  indizio_luogo: z
    .string()
    .nullable()
    .describe(
      'Targhe di via, numeri di linea, insegne di negozi o cartelli LEGGIBILI nella foto, utili a capire dove si trova. null se non ce ne sono.',
    ),
  persone_presenti: z
    .boolean()
    .describe('true se nella foto ci sono persone, anche di spalle o sfocate'),
  mostra_un_problema: z
    .boolean()
    .describe('false se la foto non mostra nulla di rilevante per una segnalazione civica'),
})

const VISIONE_SYSTEM_PROMPT = `Descrivi la foto che un cittadino italiano ha inviato a un servizio civico per segnalare un problema del suo quartiere.

REGOLE INDEROGABILI

1. Descrivi SOLO ciò che si vede. Non dedurre cause, responsabilità, epoche o conseguenze. Se non si capisce cosa sia, scrivilo.

2. NON DESCRIVERE LE PERSONE. Se nell'immagine ci sono persone, il campo persone_presenti vale true e nella descrizione scrivi al massimo "sono presenti passanti". Non dedurre né citare età, genere, etnia, abbigliamento, corporatura, condizione o stato di salute di nessuno. Non descrivere i volti. Non contarle una per una.
   Chi passa per strada mentre qualcuno fotografa una buca non ha scelto di finire in un archivio: trattarlo come un dettaglio della scena è già un danno.

3. NON LEGGERE le targhe dei veicoli, i numeri di telefono, i nomi sui campanelli e i nomi propri di persona. Se compaiono, ignorali: non riportarli in nessun campo.

4. indizio_luogo: riporta solo scritte davvero leggibili e utili a localizzare — la targa di una via, il numero di una linea di autobus, l'insegna di un esercizio, un cartello stradale. Non indovinare la città. Se non si legge niente, null.

5. tipo_degrado: poche parole concrete, per esempio "buca nell'asfalto", "cassonetti traboccanti", "lampione spento", "perdita d'acqua", "muro con crepe", "marciapiede dissestato". null se non si vede nessun problema.

6. descrizione: due o tre frasi sobrie, in italiano. Niente aggettivi di indignazione, niente ipotesi. Chi legge deve poter verificare ogni parola guardando la foto.

7. mostra_un_problema: false per selfie, schermate, foto di documenti, immagini casuali o inviate per errore.`

export interface EsitoVisione {
  descrizione: string
  tipoDegrado: string | null
  indizioLuogo: string | null
  personePresenti: boolean
  mostraUnProblema: boolean
}

export interface FotoDaDescrivere {
  contenuto: Uint8Array
  mimeType: string
  reportId?: string
}

/**
 * Descrive una foto.
 *
 * @returns la descrizione strutturata, oppure `null` se il modello non ha
 *   prodotto niente di utilizzabile. Non lancia: al cittadino si risponde che
 *   non abbiamo capito la foto e gli si chiede di raccontarla a parole.
 */
export async function descriviFoto(foto: FotoDaDescrivere): Promise<EsitoVisione | null> {
  const log = logger.child({ report_id: foto.reportId ?? null })

  try {
    // L'immagine viaggia come data URL in base64. È l'unica strada possibile:
    // un URL pubblico verso il nostro file non esiste, e non deve esistere.
    const base64 = Buffer.from(foto.contenuto).toString('base64')

    const completamento = await getOpenAI().chat.completions.parse({
      model: MODEL_VISION,
      messages: [
        { role: 'system', content: VISIONE_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Questa è la foto inviata dal cittadino. Compila i campi richiesti.',
            },
            {
              type: 'image_url',
              image_url: { url: `data:${foto.mimeType};base64,${base64}`, detail: 'auto' },
            },
          ],
        },
      ],
      response_format: zodResponseFormat(FotoSchema, 'foto'),
      temperature: 0,
    })

    logAiUsage({
      model: MODEL_VISION,
      operation: 'visione',
      input_tokens: completamento.usage?.prompt_tokens ?? 0,
      output_tokens: completamento.usage?.completion_tokens ?? 0,
      cost_eur: stimaCostoEuro(
        MODEL_VISION,
        completamento.usage?.prompt_tokens ?? 0,
        completamento.usage?.completion_tokens ?? 0,
      ),
      report_id: foto.reportId,
    })

    const esito = completamento.choices[0]?.message.parsed
    if (!esito || !esito.descrizione.trim()) {
      log.warn('visione.nessuna_descrizione', { bytes: foto.contenuto.byteLength })
      return null
    }

    log.info('visione.completata', {
      tipo_degrado: esito.tipo_degrado,
      persone_presenti: esito.persone_presenti,
      mostra_un_problema: esito.mostra_un_problema,
    })

    return {
      descrizione: esito.descrizione.trim(),
      tipoDegrado: esito.tipo_degrado?.trim() || null,
      indizioLuogo: esito.indizio_luogo?.trim() || null,
      personePresenti: esito.persone_presenti,
      mostraUnProblema: esito.mostra_un_problema,
    }
  } catch (errore) {
    log.error('visione.fallita', { bytes: foto.contenuto.byteLength, error: errore })
    return null
  }
}
