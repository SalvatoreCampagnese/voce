import { NextResponse } from 'next/server'
import { verificaConfigurazioneServer } from '@/lib/config/env'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Controllo di salute: dice se l'ambiente è completo e se il database risponde.
 *
 * Serve dopo un deploy, quando la domanda è «funziona davvero?» e la risposta
 * non deve essere «la home carica, quindi sì».
 *
 * Non espone MAI il valore di un segreto: solo il nome di quelli mancanti.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const configurazione = verificaConfigurazioneServer()

  let database: 'ok' | 'errore' = 'errore'
  let dettaglioDatabase: string | undefined
  try {
    const sb = await createServerSupabase()
    const { error } = await sb.from('public_city_stats').select('city').limit(1)
    if (error) throw error
    database = 'ok'
  } catch (errore) {
    dettaglioDatabase = errore instanceof Error ? errore.message : String(errore)
  }

  const tutto = configurazione.completa && database === 'ok'

  return NextResponse.json(
    {
      stato: tutto ? 'ok' : 'incompleto',
      configurazione: configurazione.completa
        ? 'completa'
        : { mancanti: configurazione.problemi },
      database,
      dettaglioDatabase,
    },
    { status: tutto ? 200 : 503 },
  )
}
