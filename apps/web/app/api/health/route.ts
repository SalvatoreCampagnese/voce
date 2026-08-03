import { NextResponse } from 'next/server'
import { verificaConfigurazioneServer } from '@/lib/config/env'
import { getSoglie, verificaCoerenza } from '@/lib/config/thresholds'
import { createServerSupabase } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logger } from '@/lib/utils/logger'

/**
 * Controllo di salute: dice se l'ambiente è completo, se il database risponde e
 * se applicazione e database sono d'accordo sulle soglie di privacy.
 *
 * Serve dopo un deploy, quando la domanda è «funziona davvero?» e la risposta
 * non deve essere «la home carica, quindi sì».
 *
 * Non espone MAI il valore di un segreto: solo il nome di quelli mancanti.
 * Le due soglie riportate qui sotto non sono riservate — l'interfaccia dice già
 * ai cittadini che servono tre persone diverse perché un gruppo sia pubblico.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const configurazione = verificaConfigurazioneServer()

  // --- Database -------------------------------------------------------------
  let database: 'ok' | 'errore' = 'errore'
  let dettaglioDatabase: string | undefined
  try {
    const sb = await createServerSupabase()
    const { error } = await sb.from('public_platform_stats').select('citizens_count').limit(1)
    if (error) throw error
    database = 'ok'
  } catch (errore) {
    dettaglioDatabase = errore instanceof Error ? errore.message : JSON.stringify(errore)
  }

  // --- Soglie ---------------------------------------------------------------
  // Le soglie di privacy vivono in due posti: le variabili d'ambiente
  // dell'applicazione e la tabella app_config del database. Il database è
  // l'autorità — è lui che filtra davvero le viste pubbliche — ma se
  // l'applicazione crede a un altro numero, chi amministra pensa di aver
  // cambiato una soglia e invece non ha cambiato niente. Quella divergenza non
  // si vede da nessuna parte finché non espone qualcuno: qui si vede.
  let soglie: 'ok' | 'incoerenti' | 'non-verificabili' = 'non-verificabili'
  const problemiSoglie: string[] = []
  let minPublicCitizens: number | undefined
  let geoBlurMeters: number | undefined

  try {
    const s = getSoglie()
    minPublicCitizens = s.minPublicCitizens
    geoBlurMeters = s.geoBlurMeters

    const coerenza = verificaCoerenza(s)
    problemiSoglie.push(...coerenza.errori, ...coerenza.avvisi)

    const service = createServiceClient()
    const { data, error } = await service.rpc('get_privacy_config')
    if (error) throw error

    const dbConfig = new Map(
      ((data ?? []) as { key: string; value_int: number }[]).map((r) => [r.key, r.value_int]),
    )

    const confronti: [string, number | undefined, number | undefined][] = [
      ['min_public_citizens', s.minPublicCitizens, dbConfig.get('min_public_citizens')],
      ['geo_blur_meters', s.geoBlurMeters, dbConfig.get('geo_blur_meters')],
    ]

    for (const [chiave, app, db] of confronti) {
      if (db === undefined) {
        problemiSoglie.push(`${chiave}: assente in app_config sul database`)
      } else if (app !== db) {
        problemiSoglie.push(
          `${chiave}: l'applicazione usa ${app}, il database applica ${db}. ` +
            'Vince il database: aggiorna app_config oppure la variabile d\'ambiente.',
        )
      }
    }

    soglie = problemiSoglie.length === 0 ? 'ok' : 'incoerenti'
  } catch (errore) {
    problemiSoglie.push(
      errore instanceof Error ? errore.message : JSON.stringify(errore),
    )
    soglie = 'incoerenti'
  }

  const tutto = configurazione.completa && database === 'ok' && soglie === 'ok'

  if (!tutto) {
    logger.warn('health.non_ok', { database, soglie, problemi: problemiSoglie })
  }

  return NextResponse.json(
    {
      stato: tutto ? 'ok' : 'incompleto',
      configurazione: configurazione.completa ? 'completa' : { mancanti: configurazione.problemi },
      database,
      dettaglioDatabase,
      soglie,
      privacy: { minPublicCitizens, geoBlurMeters },
      problemiSoglie: problemiSoglie.length > 0 ? problemiSoglie : undefined,
    },
    { status: tutto ? 200 : 503 },
  )
}
