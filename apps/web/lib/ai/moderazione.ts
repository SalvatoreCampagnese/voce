import { MODEL_MODERATION, getOpenAI, stimaCostoEuro } from '@/lib/ai/openai'
import { logAiUsage, logger, serializeError } from '@/lib/utils/logger'

/**
 * Moderazione dei contenuti (PLAN2 §1.3).
 *
 * Lo schema ha lo stato `quarantena` dalla prima migrazione e nessuna riga di
 * codice lo usava: oggi un insulto, una minaccia o un contenuto diffamatorio
 * entra come qualunque altra segnalazione, si raggruppa, e può finire citato
 * dentro un esposto indirizzato a una Procura — con la firma di cittadini che
 * non l'hanno mai letto. Questo modulo è ciò che impedisce quel percorso.
 *
 * Due limiti da tenere fermi, perché sono il confine fra moderazione e censura:
 *
 * 1. La quarantena NON cancella: mette da parte in attesa di una persona.
 *    I falsi positivi su dialetto e turpiloquio non offensivo sono attesi
 *    («'sta schifezza di strada» non è odio), e sono accettabili solo perché
 *    esiste una revisione umana nel pannello di amministrazione che rimette
 *    in circolo la segnalazione e la riaggancia al suo gruppo.
 *
 * 2. Il giudizio è sul TESTO, mai sulla persona. Il punteggio non si accumula
 *    per cittadino, non si media, non entra in nessuna decisione che riguardi
 *    chi ha scritto. Un punteggio di attendibilità sui cittadini è
 *    esplicitamente ciò che PLAN2 §7 vieta di costruire.
 */
export interface EsitoModerazione {
  /** Vero se il contenuto va messo da parte per una revisione umana. */
  bloccato: boolean
  /** Le categorie che hanno fatto scattare il classificatore, per nome. */
  categorie: string[]
  /** Punteggio massimo fra tutte le categorie, fra 0 e 1. */
  punteggio: number
}

const ESITO_PULITO: EsitoModerazione = { bloccato: false, categorie: [], punteggio: 0 }

/**
 * Passa un testo al classificatore di contenuti.
 *
 * Non lancia mai. Se il servizio di moderazione è irraggiungibile o risponde in
 * errore, restituisce «non bloccato» e logga a livello warn: perdere il
 * messaggio di un cittadino perché un servizio accessorio era giù è un danno
 * certo, lasciar passare un insulto è un danno che una persona può ancora
 * riparare in revisione. Fra i due si sceglie sempre il secondo.
 */
export async function moderaTesto(
  testo: string,
  reportId?: string,
): Promise<EsitoModerazione> {
  const contenuto = testo.trim()
  // Niente testo, niente chiamata: sarebbe spesa e latenza per un risultato noto.
  if (!contenuto) return ESITO_PULITO

  try {
    const risposta = await getOpenAI().moderations.create({
      model: MODEL_MODERATION,
      input: contenuto,
    })

    // La moderazione è gratuita, ma la chiamata si registra lo stesso: una
    // verifica che non compare nei log è indistinguibile da una verifica che
    // non è mai stata fatta, e questa è proprio quella che dovremo dimostrare
    // di aver fatto se un contenuto sbagliato finisce in un atto.
    logAiUsage({
      model: MODEL_MODERATION,
      operation: 'moderation',
      input_tokens: 0,
      output_tokens: 0,
      cost_eur: stimaCostoEuro(MODEL_MODERATION, 0),
      report_id: reportId,
    })

    const esito = risposta.results[0]
    if (!esito) {
      logger.warn('moderazione.risposta_vuota', { report_id: reportId })
      return ESITO_PULITO
    }

    // `categories` è un oggetto con una chiave per categoria: si tengono solo
    // quelle a true. Senza le categorie il punteggio non è contestabile, e chi
    // rivede deve sapere PERCHÉ il sistema ha messo da parte una persona.
    const categorie = Object.entries(esito.categories)
      .filter(([, attiva]) => attiva === true)
      .map(([nome]) => nome)

    const punteggi = Object.values(esito.category_scores).filter(
      (valore): valore is number => typeof valore === 'number' && Number.isFinite(valore),
    )
    const punteggio = punteggi.length > 0 ? Math.max(...punteggi) : 0

    if (esito.flagged) {
      logger.warn('moderazione.contenuto_segnalato', {
        report_id: reportId,
        categorie,
        punteggio,
      })
    }

    return { bloccato: esito.flagged, categorie, punteggio }
  } catch (errore) {
    logger.warn('moderazione.non_disponibile', {
      report_id: reportId,
      error: serializeError(errore),
    })
    return ESITO_PULITO
  }
}
