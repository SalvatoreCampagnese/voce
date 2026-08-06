import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { assertInternalKey, isUnauthorizedError } from '@/lib/security/internal'
import { classificaRisposta } from '@/lib/ai/risposte'
import { logger } from '@/lib/utils/logger'

export const runtime = 'nodejs'
export const maxDuration = 60

// `z.uuid()` e non `z.string().uuid()`: in Zod 4 il secondo è deprecato.
const CorpoSchema = z.object({
  responseId: z.uuid(),
})

/**
 * Legge e classifica una risposta della pubblica amministrazione (PLAN2 §3.2).
 *
 * Endpoint interno: lo chiama il pannello di amministrazione dopo che qualcuno
 * ha incollato il testo della risposta. Non è raggiungibile da un client — la
 * lettura costa una chiamata al modello e non deve dipendere da chi passa di lì.
 *
 * Quello che questo endpoint produce NON è pubblico. Scrive la classificazione,
 * il motivo e il rimedio proposto, e lascia `confirmed_by` a null: finché una
 * persona non conferma, la vista `public_action_responses` non mostra nulla di
 * quella riga. La conferma è un'azione umana e avviene altrove, dal pannello.
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

  let responseId: string
  try {
    const analisi = CorpoSchema.safeParse(await req.json())
    if (!analisi.success) {
      return NextResponse.json({ error: 'responseId mancante o non valido' }, { status: 400 })
    }
    responseId = analisi.data.responseId
  } catch {
    return NextResponse.json({ error: 'corpo della richiesta non leggibile' }, { status: 400 })
  }

  try {
    const esito = await classificaRisposta(responseId)
    return NextResponse.json({ ok: true, ...esito })
  } catch (errore) {
    logger.error('classifica-risposta.fallita', {
      response_id: responseId,
      error: errore,
    })
    return NextResponse.json({ ok: false, errore: 'classificazione fallita' }, { status: 500 })
  }
}
