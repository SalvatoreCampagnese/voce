import { NextResponse, type NextRequest } from 'next/server'

import { rilevaEventiDaNotificare, spediciNotifichePendenti } from '@/lib/notifications'
import { assertCronSecret, isUnauthorizedError } from '@/lib/security/internal'
import { logger } from '@/lib/utils/logger'

export const runtime = 'nodejs'
// Letterale statico: Next.js non accetta una costante importata qui.
// Il valore documentato è CRON_MAX_DURATION_SECONDS in lib/config/constants.ts.
export const maxDuration = 60

/**
 * Il job che mantiene la promessa del bot (PLAN2 §1.1).
 *
 * Due fasi, in quest'ordine e mai al contrario:
 *   1. rilevamento — guarda i gruppi cambiati e accoda gli avvisi mancanti;
 *   2. spedizione  — svuota la coda su Telegram e posta elettronica.
 *
 * Prima si accoda e poi si spedisce nello stesso giro: un evento rilevato
 * stanotte parte stanotte. Se la spedizione fallisce, la riga resta in coda e
 * il giro successivo riprova — quello che non si può recuperare è un evento
 * mai accodato.
 *
 * Nessuna delle due fasi lancia: restituiscono contatori. Un cron che esplode a
 * metà lascia il lavoro fatto senza log di esito, e un job senza log di esito è
 * un job che nessuno sa se è girato.
 */
export async function GET(req: NextRequest) {
  try {
    assertCronSecret(req)
  } catch (errore) {
    if (isUnauthorizedError(errore)) {
      return NextResponse.json({ error: 'non autorizzato' }, { status: errore.status })
    }
    throw errore
  }

  const inizio = Date.now()

  try {
    const rilevamento = await rilevaEventiDaNotificare()
    const spedizione = await spediciNotifichePendenti()

    logger.info('cron.notifiche.completato', {
      duration_ms: Date.now() - inizio,
      gruppi_esaminati: rilevamento.gruppiEsaminati,
      accodate: rilevamento.accodate,
      spedite: spedizione.spedite,
      fallite: spedizione.fallite,
      saltate: spedizione.saltate,
    })

    return NextResponse.json({
      ok: true,
      rilevamento,
      spedizione,
    })
  } catch (errore) {
    logger.error('cron.notifiche.fallito', {
      error: errore,
      duration_ms: Date.now() - inizio,
    })
    return NextResponse.json({ ok: false, errore: 'esecuzione fallita' }, { status: 500 })
  }
}
