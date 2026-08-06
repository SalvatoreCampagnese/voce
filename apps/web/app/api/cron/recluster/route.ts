import { NextResponse, type NextRequest } from 'next/server'

import { assertCronSecret, isUnauthorizedError } from '@/lib/security/internal'
import { ricostruisciGruppi } from '@/lib/ai/clustering'
import { scansionaGruppiCresciuti } from '@/lib/security/brigading'
import { getSoglie } from '@/lib/config/thresholds'
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
    const inizio = Date.now()
    const risultato = await ricostruisciGruppi()

    // Un gruppo nato pulito può diventare una campagna il giorno dopo: qui si
    // rivedono quelli cresciuti dall'ultimo giro. Gira col tempo che avanza dal
    // clustering, che è il lavoro prioritario: se il budget è finito, la
    // scansione salta e riparte domani — meglio una revisione in ritardo che un
    // cron troncato a metà dalla piattaforma.
    const budgetResiduo = getSoglie().cronTimeBudgetMs - (Date.now() - inizio)
    const brigading = await scansionaGruppiCresciuti({ budgetMs: budgetResiduo })

    logger.info('cron.recluster.completato', { ...risultato, brigading })
    return NextResponse.json({ ok: true, ...risultato, brigading })
  } catch (errore) {
    logger.error('cron.recluster.fallito', {
      messaggio: errore instanceof Error ? errore.message : String(errore),
    })
    return NextResponse.json({ ok: false, errore: 'esecuzione fallita' }, { status: 500 })
  }
}
