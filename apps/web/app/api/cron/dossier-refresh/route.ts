import { NextResponse, type NextRequest } from 'next/server'

import { assertCronSecret, isUnauthorizedError } from '@/lib/security/internal'
import { createServiceClient } from '@/lib/supabase/service'
import { generateDossier } from '@/lib/ai/dossier'
import { getSoglie } from '@/lib/config/thresholds'
import { logger } from '@/lib/utils/logger'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Rete di sicurezza della generazione atti.
 *
 * La generazione parte quando un gruppo supera la soglia, dentro un `after()`:
 * se quella chiamata fallisce (OpenAI in errore, processo terminato), il gruppo
 * resta senza atti e nessuno se ne accorge. Questo job ripesca i gruppi che
 * hanno superato la soglia ma non hanno ancora nemmeno una bozza.
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
  let elaborati = 0
  let creati = 0

  try {
    const { data: gruppi, error } = await sb
      .from('clusters')
      .select('id, citizens_count, actions(id)')
      .eq('is_synthetic', false)
      .gte('citizens_count', soglie.actionThresholdCitizens)
      .order('updated_at', { ascending: true })
      .limit(soglie.cronBatchSize)

    if (error) throw new Error(error.message)

    // Solo quelli senza nemmeno un atto: chi ne ha già uno non va rigenerato,
    // sovrascriverebbe una revisione umana.
    const senzaAtti = (gruppi ?? []).filter(
      (g) => !Array.isArray(g.actions) || g.actions.length === 0,
    )

    for (const gruppo of senzaAtti) {
      if (Date.now() - inizio > soglie.cronTimeBudgetMs) break
      try {
        const esito = await generateDossier(gruppo.id)
        elaborati += 1
        creati += esito.creati.length
      } catch (errore) {
        logger.error('cron.dossier.gruppo_fallito', {
          cluster_id: gruppo.id,
          messaggio: errore instanceof Error ? errore.message : String(errore),
        })
      }
    }

    logger.info('cron.dossier.completato', { elaborati, creati })
    return NextResponse.json({ ok: true, elaborati, atti_creati: creati })
  } catch (errore) {
    logger.error('cron.dossier.fallito', {
      messaggio: errore instanceof Error ? errore.message : String(errore),
    })
    return NextResponse.json({ ok: false, errore: 'esecuzione fallita' }, { status: 500 })
  }
}
