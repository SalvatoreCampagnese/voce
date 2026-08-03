import { NextResponse, type NextRequest } from 'next/server'

import { assertCronSecret, isUnauthorizedError } from '@/lib/security/internal'
import { createServiceClient } from '@/lib/supabase/service'
import { getSoglie } from '@/lib/config/thresholds'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * «Perché non si è formato nessun gruppo?»
 *
 * È la domanda che ci si pone ogni volta durante un pilot, e senza uno
 * strumento si finisce per rispondere a intuito. Qui la risposta è un numero:
 * per ogni segnalazione ancora sola, quante altre le assomigliano abbastanza.
 * Se il massimo è 4 e la soglia è 5, il sistema non è rotto — manca una voce.
 *
 * Protetta da CRON_SECRET: espone testi anonimizzati e conteggi, cioè più di
 * quanto debba vedere un visitatore.
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

  const { data: reports, error } = await sb
    .from('reports')
    .select('id, status, category, city, neighborhood, cluster_id, anon_text, created_at')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    return NextResponse.json({ errore: error.message }, { status: 500 })
  }

  const tutte = reports ?? []

  // Quante segnalazioni per stato: se restano su 'nuovo', il problema è il
  // triage, non il raggruppamento.
  const perStato: Record<string, number> = {}
  for (const r of tutte) perStato[r.status] = (perStato[r.status] ?? 0) + 1

  // Le orfane sono le uniche candidate a formare un gruppo nuovo.
  const orfane = tutte.filter((r) => r.cluster_id === null && r.status === 'triaged')

  // Il raggruppamento è vincolato per categoria e zona PRIMA che per
  // similarità: due buche in quartieri diversi non sono lo stesso problema.
  const perGruppoLogico = new Map<string, typeof orfane>()
  for (const r of orfane) {
    const chiave = [r.category ?? 'senza-categoria', r.city ?? 'senza-città', r.neighborhood ?? '—'].join(' · ')
    const elenco = perGruppoLogico.get(chiave) ?? []
    elenco.push(r)
    perGruppoLogico.set(chiave, elenco)
  }

  // Per ogni orfana: quante altre orfane le somigliano sopra la soglia.
  // È esattamente il conteggio che decide se nasce un gruppo.
  const vicinanze: {
    testo: string
    categoria: string | null
    simili: number
    mancanti: number
  }[] = []

  for (const r of orfane) {
    const { data: simili } = await sb.rpc('match_similar_reports', {
      query_embedding: (
        await sb.from('report_embeddings').select('embedding').eq('report_id', r.id).maybeSingle()
      ).data?.embedding as unknown as string,
      match_threshold: soglie.similarityNew,
      match_count: 50,
      filter_city: r.city ?? undefined,
      filter_neighborhood: r.neighborhood ?? undefined,
      filter_category: r.category ?? undefined,
    })

    const candidate = (simili ?? []).filter((s) => !s.cluster_id).length
    vicinanze.push({
      testo: (r.anon_text ?? '').slice(0, 70),
      categoria: r.category,
      simili: candidate,
      mancanti: Math.max(0, soglie.minReportsNewCluster - candidate),
    })
  }

  vicinanze.sort((a, b) => b.simili - a.simili)
  const migliore = vicinanze[0]

  const senzaEmbedding = orfane.length - vicinanze.filter((v) => v.simili > 0).length

  let diagnosi: string
  if (orfane.length === 0 && (perStato['nuovo'] ?? 0) > 0) {
    diagnosi =
      'Ci sono segnalazioni ferme su "nuovo": il triage non è passato. ' +
      'Controlla OPENAI_API_KEY e i log del cron di recupero.'
  } else if (orfane.length === 0) {
    diagnosi = 'Nessuna segnalazione sola: sono già tutte in un gruppo.'
  } else if (!migliore || migliore.simili === 0) {
    diagnosi =
      'Nessuna segnalazione somiglia a un\'altra sopra la soglia. ' +
      'O parlano di problemi diversi, o hanno categorie/zone diverse, ' +
      `o SIMILARITY_NEW (${soglie.similarityNew}) è troppo alta per questi testi.`
  } else if (migliore.simili < soglie.minReportsNewCluster) {
    diagnosi =
      `Il gruppo più numeroso possibile ha ${migliore.simili} segnalazioni, ` +
      `ma ne servono ${soglie.minReportsNewCluster}. ` +
      `Ne mancano ${migliore.mancanti}: o ne arriva un'altra sullo stesso problema, ` +
      'oppure abbassi MIN_REPORTS_NEW_CLUSTER.'
  } else {
    diagnosi =
      `Ci sono ${migliore.simili} segnalazioni simili: il gruppo può nascere. ` +
      'Se non è ancora comparso, lancia /api/cron/recluster.'
  }

  return NextResponse.json({
    diagnosi,
    soglie: {
      similarityNew: soglie.similarityNew,
      similarityAssign: soglie.similarityAssign,
      minReportsNewCluster: soglie.minReportsNewCluster,
      minPublicCitizens: soglie.minPublicCitizens,
    },
    segnalazioni: { totali: tutte.length, perStato, sole: orfane.length },
    senzaEmbedding,
    raggruppabiliPerCategoriaEZona: Object.fromEntries(
      [...perGruppoLogico.entries()].map(([k, v]) => [k, v.length]),
    ),
    vicinanze,
  })
}
