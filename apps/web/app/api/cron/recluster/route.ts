import { NextResponse, type NextRequest } from 'next/server'

import { assertCronSecret, isUnauthorizedError } from '@/lib/security/internal'
import { ricostruisciGruppi } from '@/lib/ai/clustering'
import { logger } from '@/lib/utils/logger'

export const runtime = 'nodejs'
// Next pretende un letterale statico: non si può importare la costante.
export const maxDuration = 60

/** Crea nuovi gruppi dalle segnalazioni ancora sole. */
export async function GET(req: NextRequest) {
  try {
    assertCronSecret(req)
  } catch (errore) {
    if (isUnauthorizedError(errore)) {
      return NextResponse.json({ error: 'non autorizzato' }, { status: errore.status })
    }
    throw errore
  }

  try {
    const risultato = await ricostruisciGruppi()
    logger.info('cron.recluster.completato', { ...risultato })
    return NextResponse.json({ ok: true, ...risultato })
  } catch (errore) {
    logger.error('cron.recluster.fallito', {
      messaggio: errore instanceof Error ? errore.message : String(errore),
    })
    return NextResponse.json({ ok: false, errore: 'esecuzione fallita' }, { status: 500 })
  }
}
