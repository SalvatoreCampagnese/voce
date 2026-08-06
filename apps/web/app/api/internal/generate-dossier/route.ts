import { NextResponse, type NextRequest } from 'next/server'

import { assertInternalKey, isUnauthorizedError } from '@/lib/security/internal'
import { generateDossier } from '@/lib/ai/dossier'
import { logger } from '@/lib/utils/logger'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Prepara le bozze degli atti per un gruppo.
 *
 * Endpoint interno: lo chiama il server quando un gruppo supera la soglia, e il
 * cron di recupero per i gruppi rimasti indietro. Non è raggiungibile da un
 * client — generare atti è costoso e non deve dipendere da chi passa di lì.
 */
export async function POST(req: NextRequest) {
  try {
    assertInternalKey(req)
  } catch (errore) {
    if (isUnauthorizedError(errore)) {
      return NextResponse.json({ error: 'non autorizzato' }, { status: errore.status })
    }
    throw errore
  }

  let clusterId: string
  try {
    const corpo = (await req.json()) as { clusterId?: string }
    if (!corpo.clusterId) throw new Error('clusterId mancante')
    clusterId = corpo.clusterId
  } catch {
    return NextResponse.json({ error: 'clusterId mancante' }, { status: 400 })
  }

  try {
    const esito = await generateDossier(clusterId)
    return NextResponse.json({ ok: true, ...esito })
  } catch (errore) {
    logger.error('generate-dossier.fallito', {
      cluster_id: clusterId,
      messaggio: errore instanceof Error ? errore.message : String(errore),
    })
    return NextResponse.json({ ok: false, errore: 'generazione fallita' }, { status: 500 })
  }
}
