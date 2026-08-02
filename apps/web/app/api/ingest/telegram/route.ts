import { NextResponse, after, type NextRequest } from 'next/server'

import { createServiceClient } from '@/lib/supabase/service'
import { serverEnv } from '@/lib/config/env'
import { logger } from '@/lib/utils/logger'
import { checkReportRateLimit } from '@/lib/security/rate-limit'
import { triageReport } from '@/lib/ai/triage'
import { MESSAGGI, inviaMessaggioTelegram } from '@/lib/channels/telegram'

// L'SDK OpenAI e il client Supabase con service role girano su Node, non su edge.
export const runtime = 'nodejs'
export const maxDuration = 60

const LUNGHEZZA_MINIMA = 15

/**
 * Webhook del bot Telegram.
 *
 * Ordine delle operazioni, scelto perché non si perda mai il messaggio di un
 * cittadino: prima si salva la segnalazione, poi si risponde alla persona,
 * infine si fa il lavoro pesante (triage) dopo la risposta HTTP.
 *
 * Se il triage fallisce, il report resta 'nuovo' e il cron di recupero lo
 * ripesca. Se fallisse il salvataggio, invece, restituiamo 500 e Telegram
 * rinvia l'update: in nessuno dei due casi il racconto va perso.
 */
export async function POST(req: NextRequest) {
  // --- Autenticazione del webhook ------------------------------------------
  // Senza questo controllo, chiunque scopra l'URL può iniettare segnalazioni
  // false e inquinare i gruppi su cui poi si costruisce un esposto.
  const segreto = req.headers.get('x-telegram-bot-api-secret-token')
  if (!segreto || segreto !== serverEnv.TELEGRAM_WEBHOOK_SECRET) {
    logger.warn('telegram.webhook_non_autorizzato', {
      ha_header: Boolean(segreto),
    })
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let update: TelegramUpdate
  try {
    update = (await req.json()) as TelegramUpdate
  } catch {
    return NextResponse.json({ ok: true })
  }

  const messaggio = update.message ?? update.edited_message
  const chatId = messaggio?.chat?.id
  const mittente = messaggio?.from

  // Update che non ci riguardano (modifiche di canale, callback...): 200 e via,
  // altrimenti Telegram continua a rinviarli.
  if (!messaggio || !chatId || !mittente || mittente.is_bot) {
    return NextResponse.json({ ok: true })
  }

  const testo = messaggio.text?.trim()

  if (!testo) {
    await inviaMessaggioTelegram(chatId, MESSAGGI.soloTesto)
    return NextResponse.json({ ok: true })
  }

  if (testo === '/start') {
    await inviaMessaggioTelegram(chatId, MESSAGGI.benvenuto)
    return NextResponse.json({ ok: true })
  }

  if (testo.length < LUNGHEZZA_MINIMA) {
    await inviaMessaggioTelegram(chatId, MESSAGGI.troppoBreve)
    return NextResponse.json({ ok: true })
  }

  const sb = createServiceClient()

  try {
    // --- Cittadino ---------------------------------------------------------
    const { data: cittadino, error: erroreCittadino } = await sb
      .from('citizens')
      .upsert(
        {
          telegram_id: mittente.id,
          display_name: mittente.first_name ?? null,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'telegram_id' },
      )
      .select('id')
      .single()

    if (erroreCittadino || !cittadino) {
      throw new Error(`upsert cittadino fallito: ${erroreCittadino?.message}`)
    }

    // --- Limite anti abuso -------------------------------------------------
    const limite = await checkReportRateLimit(cittadino.id, 'telegram')
    if (!limite.allowed) {
      await inviaMessaggioTelegram(
        chatId,
        MESSAGGI.troppeSegnalazioni(Math.ceil(limite.retryAfterSeconds / 60)),
      )
      return NextResponse.json({ ok: true })
    }

    // --- Segnalazione ------------------------------------------------------
    // external_id = update_id: Telegram rinvia lo stesso update se non rispondiamo
    // in tempo, e il vincolo unique(channel, external_id) impedisce il doppione.
    const { data: report, error: erroreReport } = await sb
      .from('reports')
      .insert({
        citizen_id: cittadino.id,
        channel: 'telegram',
        external_id: String(update.update_id),
        raw_text: testo,
        status: 'nuovo',
      })
      .select('id')
      .single()

    if (erroreReport) {
      // 23505 = violazione di unique: è un rinvio dello stesso update.
      // Va confermato con 200, altrimenti Telegram riprova all'infinito.
      if (erroreReport.code === '23505') {
        logger.info('telegram.update_duplicato', { update_id: update.update_id })
        return NextResponse.json({ ok: true })
      }
      throw new Error(`insert segnalazione fallito: ${erroreReport.message}`)
    }

    logger.info('telegram.segnalazione_ricevuta', {
      report_id: report.id,
      citizen_id: cittadino.id,
    })

    // --- Risposta immediata al cittadino -----------------------------------
    await inviaMessaggioTelegram(
      chatId,
      MESSAGGI.ricevuta(`${serverEnv.APP_URL}/le-mie-segnalazioni`),
    )

    // --- Lavoro pesante dopo la risposta HTTP ------------------------------
    after(async () => {
      try {
        await triageReport(report.id)
      } catch (errore) {
        // Non si rilancia: la segnalazione è salva e il cron la riprenderà.
        logger.error('telegram.triage_fallito', {
          report_id: report.id,
          messaggio: errore instanceof Error ? errore.message : String(errore),
        })
      }
    })

    return NextResponse.json({ ok: true })
  } catch (errore) {
    logger.error('telegram.webhook_errore', {
      update_id: update.update_id,
      messaggio: errore instanceof Error ? errore.message : String(errore),
    })
    await inviaMessaggioTelegram(chatId, MESSAGGI.errore)
    // 500: Telegram rinvia l'update e la segnalazione ha una seconda occasione.
    return NextResponse.json({ error: 'errore interno' }, { status: 500 })
  }
}

// --- Tipi minimi dell'API Telegram -----------------------------------------
// Solo i campi che usiamo davvero: importare un pacchetto di tipi completo per
// cinque proprietà non vale la dipendenza.
interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  edited_message?: TelegramMessage
}

interface TelegramMessage {
  message_id: number
  from?: { id: number; is_bot: boolean; first_name?: string; username?: string }
  chat?: { id: number }
  text?: string
  date: number
}
