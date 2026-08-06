import { NextResponse, type NextRequest } from 'next/server'

import { aggiornaCronologiePendenti } from '@/lib/ai/cronologia'
import { assertCronSecret, isUnauthorizedError } from '@/lib/security/internal'
import { logger } from '@/lib/utils/logger'

export const runtime = 'nodejs'
// Next pretende un letterale statico: non si può importare la costante.
export const maxDuration = 60

/**
 * Riscrive la cronologia dei gruppi che sono cambiati (PLAN2 §3.3).
 *
 * Gira una volta al giorno. Non tocca i gruppi fermi: un gruppo che non riceve
 * segnalazioni e non ha atti in movimento non costa nulla, ed è la ragione per
 * cui il costo dichiarato — una chiamata per gruppo al giorno — regge anche con
 * molti gruppi aperti.
 *
 * L'esito viene sempre loggato, anche quando non c'è niente da fare: un cron
 * silenzioso è indistinguibile da un cron che non è mai partito.
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
    const risultato = await aggiornaCronologiePendenti()
    logger.info('cron.cronologia.completato', {
      job: 'cronologia',
      duration_ms: Date.now() - inizio,
      ...risultato,
    })
    return NextResponse.json({ ok: true, ...risultato })
  } catch (errore) {
    logger.error('cron.cronologia.fallito', {
      job: 'cronologia',
      duration_ms: Date.now() - inizio,
      error: errore,
    })
    return NextResponse.json({ ok: false, errore: 'esecuzione fallita' }, { status: 500 })
  }
}
