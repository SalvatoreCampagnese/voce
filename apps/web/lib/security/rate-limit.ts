/**
 * Rate limit delle segnalazioni, su Postgres.
 *
 * Niente Redis: in 14 giorni un servizio in più è un servizio da configurare,
 * pagare e monitorare. Le segnalazioni sono già righe con un timestamp, quindi
 * la finestra scorrevole si calcola con una `count` sull'ultima ora. Il costo è
 * una query indicizzata su `(citizen_id, created_at)`.
 *
 * Limite: la finestra non è atomica rispetto all'inserimento. Due messaggi
 * arrivati nello stesso istante possono passare entrambi. Per il flooding
 * (decine di messaggi) è irrilevante; per una demo è più che sufficiente.
 *
 * **Solo server**: usa il client con service role, perché il cittadino che sta
 * per essere limitato spesso non ha ancora una sessione.
 */

import { type ReportChannel } from '@/lib/config/constants'
import { getSoglie } from '@/lib/config/thresholds'
import { createServiceClient } from '@/lib/supabase/service'
import { logger } from '@/lib/utils/logger'

export interface RateLimitResult {
  /** `false` se la segnalazione va rifiutata. */
  allowed: boolean
  /** Quante segnalazioni restano al cittadino nella finestra corrente. */
  remaining: number
  /** Secondi da attendere prima di riprovare. Vale 0 quando `allowed` è true. */
  retryAfterSeconds: number
}


/**
 * Conta le segnalazioni di un cittadino nella finestra corrente e dice se può
 * inviarne un'altra.
 *
 * @param citizenId id della riga `citizens` (non `auth.users`)
 * @param channel se passato, il limite è calcolato solo su quel canale —
 *   contratto §5: «per cittadino, per canale»
 */
export async function checkReportRateLimit(
  citizenId: string,
  channel?: ReportChannel,
): Promise<RateLimitResult> {
  const soglie = getSoglie()
  const limite = soglie.rateLimitReportsPerHour
  const WINDOW_MS = soglie.rateLimitWindowMinutes * 60 * 1000

  const supabase = createServiceClient()
  const windowStart = new Date(Date.now() - WINDOW_MS)

  let query = supabase
    .from('reports')
    .select('created_at')
    .eq('citizen_id', citizenId)
    // Le segnalazioni sintetiche del seed non devono consumare la quota di
    // nessuno: servono a riempire l'interfaccia, non a limitare le persone.
    .eq('is_synthetic', false)
    .gte('created_at', windowStart.toISOString())
    .order('created_at', { ascending: true })
    // Una riga in più della soglia basta a decidere: non serve contarle tutte.
    .limit(limite + 1)

  if (channel) {
    query = query.eq('channel', channel)
  }

  const { data, error } = await query

  if (error) {
    // Scelta esplicita: se il conteggio fallisce si lascia passare.
    // Perdere il messaggio di un cittadino per un errore nostro è il
    // fallimento peggiore possibile (contratto §8); il flooding, no.
    logger.error('rate_limit.query_failed', {
      citizen_id: citizenId,
      channel,
      error,
    })
    return { allowed: true, remaining: limite, retryAfterSeconds: 0 }
  }

  const recent = data ?? []
  const used = recent.length
  const remaining = Math.max(0, limite - used)

  if (used < limite) {
    return { allowed: true, remaining, retryAfterSeconds: 0 }
  }

  // La finestra si libera quando la segnalazione più vecchia ne esce.
  const oldest = recent[0]?.created_at
  const oldestMs = oldest ? new Date(oldest).getTime() : Date.now()
  const freeInMs = oldestMs + WINDOW_MS - Date.now()
  const retryAfterSeconds = Math.max(1, Math.ceil(freeInMs / 1000))

  logger.warn('rate_limit.exceeded', {
    citizen_id: citizenId,
    channel,
    used,
    limit: limite,
    retry_after_seconds: retryAfterSeconds,
  })

  return { allowed: false, remaining: 0, retryAfterSeconds }
}
