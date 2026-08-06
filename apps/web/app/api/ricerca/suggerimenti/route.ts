import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { cercaGruppi } from '@/lib/queries/ricerca'
import { getClientIp, hashIp } from '@/lib/utils/hash'
import { logger, serializeError } from '@/lib/utils/logger'

/**
 * «Prima di segnalare, guarda questi» (PLAN2 §4.2).
 *
 * Mentre una persona racconta il suo problema, questa route le mostra i gruppi
 * pubblici che le somigliano. Non serve a dirle «esiste già, lascia perdere»:
 * serve a farle vedere che non è sola prima ancora di premere invia.
 *
 * È un endpoint pubblico che paga un embedding a ogni chiamata: senza limite
 * diventa il modo più economico di svuotarci il credito OpenAI. Tre difese, in
 * quest'ordine: lunghezza minima e massima del testo, limite per indirizzo IP,
 * cache delle query dentro `cercaGruppi`.
 *
 * Non restituisce mai testi di segnalazioni: `cercaGruppi` passa da
 * `search_public_clusters`, che espone solo titolo e riassunto dei gruppi già
 * pubblici e nessun punteggio di somiglianza.
 */

// Node.js, come ovunque nel progetto: l'SDK OpenAI non gira su edge.
export const runtime = 'nodejs'

const SchemaRichiesta = z.object({
  // 40 caratteri è la soglia sotto cui il testo non dice ancora abbastanza per
  // trovare qualcosa di sensato: sotto, si spenderebbe un embedding per
  // proporre gruppi a caso, che è peggio di non proporre niente.
  testo: z.string().trim().min(40).max(600),
  citta: z.string().trim().max(100).optional(),
})

/** Al massimo tre: una lista lunga sposta l'attenzione dal racconto da scrivere. */
const MAX_SUGGERIMENTI = 3

/**
 * Limite per indirizzo IP, in memoria.
 *
 * Su Vercel la memoria è per istanza, quindi questo è un tetto morbido: chi
 * insiste da più connessioni può superarlo. Alza comunque di molto il costo di
 * un abuso banale e non aggiunge un servizio da configurare a due giorni dal
 * pilot. Se un giorno la spesa degli embedding diventa visibile, il limite va
 * spostato su Postgres come quello delle segnalazioni.
 */
const FINESTRA_MS = 5 * 60 * 1000
const MAX_RICHIESTE_PER_FINESTRA = 15
const MAX_IP_IN_MEMORIA = 5000

const richiestePerIp = new Map<string, number[]>()

function fuoriLimite(chiaveIp: string): number {
  const adesso = Date.now()
  const recenti = (richiestePerIp.get(chiaveIp) ?? []).filter(
    (istante) => adesso - istante < FINESTRA_MS,
  )

  if (recenti.length >= MAX_RICHIESTE_PER_FINESTRA) {
    richiestePerIp.set(chiaveIp, recenti)
    const piuVecchia = recenti[0] ?? adesso
    return Math.max(1, Math.ceil((piuVecchia + FINESTRA_MS - adesso) / 1000))
  }

  recenti.push(adesso)
  richiestePerIp.set(chiaveIp, recenti)

  // La mappa non deve crescere all'infinito: senza questo tetto un attacco
  // distribuito fa esaurire la memoria dell'istanza invece del credito OpenAI.
  if (richiestePerIp.size > MAX_IP_IN_MEMORIA) {
    const piuVecchia = richiestePerIp.keys().next().value
    if (piuVecchia !== undefined) richiestePerIp.delete(piuVecchia)
  }

  return 0
}

export async function POST(req: NextRequest) {
  let chiaveIp: string
  try {
    chiaveIp = await hashIp(getClientIp(req))
  } catch (errore) {
    // Senza impronta non si può limitare nessuno: meglio rifiutare che aprire
    // un endpoint a pagamento senza contatore.
    logger.error('ricerca.suggerimenti.hash_ip_fallito', serializeError(errore))
    return NextResponse.json({ gruppi: [] }, { status: 503 })
  }

  const attesa = fuoriLimite(chiaveIp)
  if (attesa > 0) {
    return NextResponse.json(
      { gruppi: [], messaggio: 'Troppe richieste. Riprova fra poco.' },
      { status: 429, headers: { 'Retry-After': String(attesa) } },
    )
  }

  let corpo: unknown
  try {
    corpo = await req.json()
  } catch {
    return NextResponse.json({ gruppi: [] }, { status: 400 })
  }

  const analisi = SchemaRichiesta.safeParse(corpo)
  if (!analisi.success) {
    // Testo troppo corto non è un errore da mostrare: il modulo semplicemente
    // non ha ancora abbastanza materiale. Si risponde vuoto, senza rumore.
    return NextResponse.json({ gruppi: [] }, { status: 200 })
  }

  const gruppi = await cercaGruppi(analisi.data.testo, {
    citta: analisi.data.citta,
    limite: MAX_SUGGERIMENTI,
  })

  return NextResponse.json(
    { gruppi: gruppi.slice(0, MAX_SUGGERIMENTI) },
    {
      // Nessuna cache condivisa: la risposta dipende da un testo privato che
      // la persona sta ancora scrivendo e non deve finire in un proxy.
      headers: { 'Cache-Control': 'no-store' },
    },
  )
}
