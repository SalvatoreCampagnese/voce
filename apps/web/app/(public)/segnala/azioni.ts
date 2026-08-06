'use server'

import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { z } from 'zod'

import { createServiceClient } from '@/lib/supabase/service'
import { checkReportRateLimit } from '@/lib/security/rate-limit'
import { triageReport } from '@/lib/ai/triage'
import { logger } from '@/lib/utils/logger'

/**
 * Invio di una segnalazione dal sito.
 *
 * È una Server Action e non una chiamata fetch: il modulo funziona anche se
 * JavaScript non carica. Sul telefono di quattro anni fa di una persona
 * arrabbiata, questa non è un'ipotesi di scuola.
 */

const SchemaSegnalazione = z.object({
  testo: z
    .string()
    .trim()
    .min(20, 'Racconta qualcosa in più: bastano un paio di frasi.')
    .max(4000, 'Il racconto è troppo lungo: prova a sintetizzare i fatti principali.'),
  luogo: z.string().trim().max(200).optional().or(z.literal('')),
  contatto: z
    .string()
    .trim()
    .min(1, 'Scrivi la tua email. Senza un recapito non possiamo tornare da te.')
    .max(200),
  citta: z.string().trim().max(100).optional().or(z.literal('')),
  quartiere: z.string().trim().max(100).optional().or(z.literal('')),
})

export interface StatoModulo {
  /** Errori legati a un campo: compaiono accanto a quel campo. */
  errori?: Record<string, string>
  /**
   * Problema che non appartiene a nessun campo (salvataggio fallito, troppe
   * segnalazioni in poco tempo). Sta in cima al modulo, non sotto una casella
   * che la persona ha compilato bene.
   */
  messaggio?: string
  valoriPrecedenti?: Record<string, string>
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TELEFONO = /^\+?\d[\d\s.-]{6,}$/

export async function inviaSegnalazione(
  _stato: StatoModulo,
  formData: FormData,
): Promise<StatoModulo> {
  const grezzi = {
    testo: String(formData.get('testo') ?? ''),
    luogo: String(formData.get('luogo') ?? ''),
    contatto: String(formData.get('contatto') ?? ''),
    citta: String(formData.get('citta') ?? ''),
    quartiere: String(formData.get('quartiere') ?? ''),
  }

  const analisi = SchemaSegnalazione.safeParse(grezzi)
  if (!analisi.success) {
    const errori: Record<string, string> = {}
    for (const problema of analisi.error.issues) {
      const campo = String(problema.path[0] ?? 'testo')
      errori[campo] ??= problema.message
    }
    // I valori tornano indietro: nessuno riscrive da capo il racconto che ha
    // appena fatto perché ha sbagliato un campo.
    return { errori, valoriPrecedenti: grezzi }
  }

  const dati = analisi.data
  const contatto = dati.contatto
  const isEmail = EMAIL.test(contatto)
  const isTelefono = TELEFONO.test(contatto)

  if (!isEmail && !isTelefono) {
    return {
      errori: {
        contatto:
          'Non riconosciamo questo recapito. Scrivi la tua email, oppure un numero di telefono.',
      },
      valoriPrecedenti: grezzi,
    }
  }

  const sb = createServiceClient()

  try {
    const identificativo = isEmail
      ? { email: contatto.toLowerCase() }
      : { phone_e164: contatto.replace(/[\s.-]/g, '') }

    const { data: cittadino, error: erroreCittadino } = await sb
      .from('citizens')
      .upsert(
        {
          ...identificativo,
          city: dati.citta || null,
          neighborhood: dati.quartiere || null,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: isEmail ? 'email' : 'phone_e164' },
      )
      .select('id')
      .single()

    if (erroreCittadino || !cittadino) {
      throw new Error(`upsert cittadino: ${erroreCittadino?.message}`)
    }

    const limite = await checkReportRateLimit(cittadino.id, 'web')
    if (!limite.allowed) {
      return {
        messaggio: `Hai inviato diverse segnalazioni in poco tempo. Riprova fra circa ${Math.ceil(
          limite.retryAfterSeconds / 60,
        )} minuti.`,
        valoriPrecedenti: grezzi,
      }
    }

    const { data: report, error: erroreReport } = await sb
      .from('reports')
      .insert({
        citizen_id: cittadino.id,
        channel: 'web',
        raw_text: dati.testo,
        location_hint: dati.luogo || null,
        city: dati.citta || null,
        neighborhood: dati.quartiere || null,
        status: 'nuovo',
      })
      .select('id')
      .single()

    if (erroreReport || !report) {
      throw new Error(`insert segnalazione: ${erroreReport?.message}`)
    }

    logger.info('web.segnalazione_ricevuta', { report_id: report.id })

    if (!isEmail) {
      // Con il solo numero di telefono non riusciamo ad avvisare nessuno: il
      // canale WhatsApp non è collegato, e `accodaNotifica()` scrive una riga
      // già fallita (lib/notifications/index.ts). Il modulo lo dice a chi
      // scrive; qui lo contiamo, perché un buco va misurato, non nascosto.
      logger.warn('web.contatto_senza_canale', {
        report_id: report.id,
        canale: 'whatsapp',
      })
    }

    after(async () => {
      try {
        await triageReport(report.id)
      } catch (errore) {
        logger.error('web.triage_fallito', {
          report_id: report.id,
          messaggio: errore instanceof Error ? errore.message : String(errore),
        })
      }
    })
  } catch (errore) {
    logger.error('web.invio_fallito', {
      messaggio: errore instanceof Error ? errore.message : String(errore),
    })
    return {
      messaggio:
        'Non siamo riusciti a salvare la segnalazione. Riprova fra qualche minuto: il testo che hai scritto è ancora qui.',
      valoriPrecedenti: grezzi,
    }
  }

  // redirect() lancia: deve stare fuori dal try, altrimenti lo intercettiamo noi.
  redirect('/segnala/inviata')
}
