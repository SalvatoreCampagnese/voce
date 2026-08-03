import { NextResponse, type NextRequest } from 'next/server'

import { assertCronSecret, isUnauthorizedError } from '@/lib/security/internal'
import { createServiceClient } from '@/lib/supabase/service'
import { triageReport } from '@/lib/ai/triage'
import { logger } from '@/lib/utils/logger'
import { getSoglie } from '@/lib/config/thresholds'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Rete di sicurezza dell'ingestione.
 *
 * I webhook rispondono subito al cittadino e fanno il triage dopo la risposta:
 * se quel lavoro fallisce (OpenAI in errore, processo terminato, quota finita),
 * la segnalazione resta salvata con status 'nuovo' e nessuno se ne accorge.
 * Questo job la ripesca. È ciò che rende accettabile l'elaborazione asincrona:
 * senza, perdere il racconto di una persona sarebbe solo questione di tempo.
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

  const soglie = getSoglie()
  const sb = createServiceClient()
  const inizio = Date.now()
  let recuperate = 0
  let fallite = 0

  try {
    // Un minuto di margine: una segnalazione appena arrivata potrebbe avere il
    // triage ancora in corso, e rifarlo sarebbe solo spesa inutile.
    const unMinutoFa = new Date(Date.now() - 60 * 1000).toISOString()

    const { data: arretrate, error } = await sb
      .from('reports')
      .select('id')
      .eq('status', 'nuovo')
      .lt('created_at', unMinutoFa)
      .order('created_at', { ascending: true })
      .limit(soglie.cronBatchSize)

    if (error) throw new Error(error.message)

    for (const report of arretrate ?? []) {
      if (Date.now() - inizio > soglie.cronTimeBudgetMs) break
      try {
        await triageReport(report.id)
        recuperate += 1
      } catch (errore) {
        fallite += 1
        logger.error('cron.rescue.triage_fallito', {
          report_id: report.id,
          messaggio: errore instanceof Error ? errore.message : String(errore),
        })
      }
    }

    logger.info('cron.rescue.completato', { recuperate, fallite })
    return NextResponse.json({ ok: true, recuperate, fallite })
  } catch (errore) {
    logger.error('cron.rescue.fallito', {
      messaggio: errore instanceof Error ? errore.message : String(errore),
    })
    return NextResponse.json({ ok: false, errore: 'esecuzione fallita' }, { status: 500 })
  }
}
