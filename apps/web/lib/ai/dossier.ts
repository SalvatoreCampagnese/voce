import { createServiceClient } from '@/lib/supabase/service'
import { logger, logAiUsage } from '@/lib/utils/logger'
import { MODEL_DOSSIER, getOpenAI, stimaCostoEuro } from '@/lib/ai/openai'
import {
  DISCLAIMER_AI,
  type ContestoAtto,
  type ModelloAtto,
  type SegnalazioneCitabile,
} from '@/lib/ai/atti/tipi'
import { espostoProcura } from '@/lib/ai/atti/esposto-procura'
import { accessoCivico } from '@/lib/ai/atti/accesso-civico'
import { mozioneConsigliere } from '@/lib/ai/atti/mozione-consigliere'
import { dossierGiornalistico } from '@/lib/ai/atti/dossier-giornalistico'

/** I quattro atti che VOCE prepara quando un gruppo supera la soglia. */
const MODELLI: ModelloAtto[] = [
  espostoProcura,
  accessoCivico,
  mozioneConsigliere,
  dossierGiornalistico,
]

export interface EsitoGenerazione {
  clusterId: string
  creati: string[]
  saltati: string[]
  falliti: string[]
  /**
   * Perché non è stato generato nulla, quando la causa non è un errore ma una
   * regola: `sintetico`, `in_revisione`, `nessuna_citazione`. Null quando la
   * generazione è stata tentata davvero.
   *
   * Esiste perché chi chiama — l'endpoint interno, il cron di recupero — possa
   * distinguere «non si doveva fare» da «non è riuscito». Le due cose finivano
   * entrambe in un esito vuoto, e un esito vuoto non dice a nessuno se
   * riprovare.
   */
  bloccato: 'sintetico' | 'in_revisione' | 'nessuna_citazione' | null
}

/**
 * Prepara le bozze degli atti per un gruppo.
 *
 * Tre cose che non cambiano, qualunque atto si generi:
 *
 * 1. Gli atti nascono `bozza`. Non `in_firma`: aprire la raccolta firme su un
 *    testo che nessuno ha letto significa far sottoscrivere ai cittadini una
 *    cosa scritta da una macchina. Il passaggio lo fa una persona.
 * 2. Il modello vede solo `anon_text`. Il testo grezzo non entra mai in un atto.
 * 3. Il destinatario si prende da `pa_endpoints`. Se non c'è, resta un
 *    segnaposto esplicito: meglio un atto bloccato che spedito all'ufficio
 *    sbagliato.
 */
export async function generateDossier(clusterId: string): Promise<EsitoGenerazione> {
  const sb = createServiceClient()
  const openai = getOpenAI()

  const esito: EsitoGenerazione = {
    clusterId,
    creati: [],
    saltati: [],
    falliti: [],
    bloccato: null,
  }

  const { data: cluster, error: erroreCluster } = await sb
    .from('clusters')
    .select('*')
    .eq('id', clusterId)
    .single()

  if (erroreCluster || !cluster) {
    throw new Error(`Gruppo ${clusterId} non trovato: ${erroreCluster?.message}`)
  }

  if (cluster.is_synthetic) {
    // Un atto costruito su segnalazioni di prova è il fallimento più grave
    // possibile per questo progetto: si ferma qui, sempre.
    logger.warn('dossier.gruppo_sintetico_ignorato', { cluster_id: clusterId })
    esito.bloccato = 'sintetico'
    return esito
  }

  /**
   * Gruppo in revisione per sospetto coordinamento (PLAN2 §5.2).
   *
   * Il controllo è qui, prima di qualunque chiamata al modello, e non è una
   * ridondanza rispetto al trigger `actions_before_insert_review`: quello lancia
   * un'eccezione sull'insert, e un'eccezione è indistinguibile da un guasto vero
   * quando la si legge in un log alle tre di notte. Il trigger è la rete; questa
   * è la strada. Sbatterci contro di proposito significherebbe anche pagare
   * quattro chiamate a OpenAI per buttarne via il risultato.
   *
   * Non è un blocco definitivo e non tocca la visibilità del gruppo: le pagine
   * pubbliche continuano a mostrarlo, perché la voce dei cittadini resta
   * pubblica anche mentre qualcuno verifica se dietro c'è una campagna. Quando
   * un amministratore toglie il flag, il cron di recupero ripassa di qui e gli
   * atti si generano da soli.
   */
  if (cluster.review_flag) {
    logger.warn('dossier.gruppo_in_revisione', {
      cluster_id: clusterId,
      motivo: cluster.review_reason,
    })
    esito.bloccato = 'in_revisione'
    return esito
  }

  const citazioni = await raccogliCitazioni(clusterId)

  if (citazioni.length === 0) {
    logger.warn('dossier.nessuna_citazione', { cluster_id: clusterId })
    esito.bloccato = 'nessuna_citazione'
    return esito
  }

  // Quali atti esistono già: rigenerarli sovrascriverebbe una revisione umana.
  const { data: esistenti } = await sb
    .from('actions')
    .select('kind')
    .eq('cluster_id', clusterId)
  const giaFatti = new Set((esistenti ?? []).map((a) => a.kind))

  for (const modello of MODELLI) {
    if (giaFatti.has(modello.kind)) {
      esito.saltati.push(modello.kind)
      continue
    }

    try {
      const destinatario = await trovaDestinatario(cluster.city, modello.ruoloDestinatario)

      const contesto: ContestoAtto = {
        cluster: {
          titolo: cluster.title,
          riassunto: cluster.summary,
          categoria: cluster.category,
          citta: cluster.city,
          quartiere: cluster.neighborhood,
          cittadini: cluster.citizens_count,
          segnalazioni: cluster.reports_count,
        },
        citazioni,
        destinatario: destinatario?.etichetta ?? null,
      }

      const completamento = await openai.chat.completions.create({
        model: MODEL_DOSSIER,
        messages: [
          { role: 'system', content: modello.systemPrompt },
          { role: 'user', content: modello.userPrompt(contesto) },
        ],
        temperature: 0.2,
      })

      const corpo = completamento.choices[0]?.message.content?.trim()
      if (!corpo) throw new Error('il modello non ha prodotto testo')

      logAiUsage({
        model: MODEL_DOSSIER,
        operation: `atto:${modello.kind}`,
        input_tokens: completamento.usage?.prompt_tokens ?? 0,
        output_tokens: completamento.usage?.completion_tokens ?? 0,
        cost_eur: stimaCostoEuro(
          MODEL_DOSSIER,
          completamento.usage?.prompt_tokens ?? 0,
          completamento.usage?.completion_tokens ?? 0,
        ),
        cluster_id: clusterId,
      })

      const { error: erroreInsert } = await sb.from('actions').insert({
        cluster_id: clusterId,
        kind: modello.kind,
        // 'bozza', mai 'in_firma': la raccolta firme si apre dopo che una
        // persona ha letto il testo. Il vincolo actions_review_before_send
        // impedisce l'invio, ma non basta: non si fa firmare un testo non letto.
        status: 'bozza',
        title: modello.titolo(contesto),
        body_markdown: componiAtto(corpo, contesto, modello),
        recipient: destinatario?.etichetta ?? null,
        recipient_endpoint_id: destinatario?.id ?? null,
        signatures_target: modello.firmeObiettivo,
      })

      if (erroreInsert) throw new Error(erroreInsert.message)

      esito.creati.push(modello.kind)
      logger.info('dossier.atto_creato', { cluster_id: clusterId, kind: modello.kind })
    } catch (errore) {
      esito.falliti.push(modello.kind)
      logger.error('dossier.atto_fallito', {
        cluster_id: clusterId,
        kind: modello.kind,
        messaggio: errore instanceof Error ? errore.message : String(errore),
      })
    }
  }

  if (esito.creati.length > 0) {
    await sb.from('clusters').update({ status: 'in_azione' }).eq('id', clusterId)
  }

  return esito
}

/**
 * Le segnalazioni del gruppo che possono essere citate in un atto.
 *
 * QUATTRO FILTRI, E NESSUNO È DECORATIVO.
 *
 * `is_synthetic = false` — un atto costruito su dati di prova è il fallimento
 * più grave possibile per questo progetto.
 *
 * `anon_text not null` — il testo grezzo non esce mai: contiene nomi, civici,
 * condizioni di salute.
 *
 * `status = 'clustered'` e `moderation_flagged = false` — sono i due arrivati
 * dopo, e sono quelli che chiudono il buco peggiore. Una segnalazione può
 * essere messa in quarantena DOPO essere entrata nel gruppo: il testo resta in
 * tabella con il suo `cluster_id` storico e, senza questi filtri, finirebbe
 * citato per esteso dentro un esposto in Procura. Il database chiude lo stesso
 * percorso con un trigger; qui è chiuso anche lato applicazione, perché la
 * difesa in profondità è l'unica che regge quando qualcuno modifica una sola
 * delle due.
 *
 * Esportata perché la usa anche lo scadenzario: gli atti di seguito devono
 * citare esattamente lo stesso insieme, con gli stessi numeri.
 */
export async function raccogliCitazioni(clusterId: string): Promise<SegnalazioneCitabile[]> {
  const sb = createServiceClient()

  const { data: segnalazioni, error } = await sb
    .from('reports')
    .select('anon_text, created_at')
    .eq('cluster_id', clusterId)
    .eq('is_synthetic', false)
    .eq('status', 'clustered')
    .eq('moderation_flagged', false)
    .not('anon_text', 'is', null)
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) {
    logger.error('dossier.citazioni_non_lette', {
      cluster_id: clusterId,
      messaggio: error.message,
    })
    return []
  }

  return (segnalazioni ?? []).map((r, i) => ({
    indice: i + 1,
    data: new Date(r.created_at).toLocaleDateString('it-IT', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    // SEMPRE null, e non è una dimenticanza.
    // `location_hint` è testo grezzo del cittadino («via Ferrari 12»): passa
    // dall'anonimizzazione solo `anon_text`. Mandare il civico dentro un atto
    // pubblico significa indicare una casa. Il luogo, nella forma generica che
    // il triage ha ritenuto pubblicabile, è già dentro `anon_text`.
    luogo: null,
    testo: r.anon_text as string,
  }))
}

/**
 * Destinatario reale, mai inventato.
 *
 * Cerca prima nel comune del gruppo, poi un contatto nazionale per quel ruolo.
 * Se non lo trova ritorna null e l'atto porta un segnaposto: un indirizzo PEC
 * sbagliato manda l'atto nel vuoto o alla persona sbagliata.
 *
 * Esportata per lo scadenzario: un sollecito va al titolare del potere
 * sostitutivo e un riesame al responsabile della trasparenza, cioè a ruoli
 * diversi da quello dell'atto originario, e la ricerca deve restare una sola.
 */
export async function trovaDestinatario(
  citta: string,
  ruolo: string,
): Promise<{ id: string; etichetta: string } | null> {
  const sb = createServiceClient()

  const { data } = await sb
    .from('pa_endpoints')
    .select('id, name, role, city, pec, email')
    .eq('role', ruolo)
    .eq('city', citta)
    .limit(1)
    .maybeSingle()

  if (!data) return null

  return {
    id: data.id,
    etichetta: data.name ? `${data.name} — ${data.city}` : `${ruolo} di ${data.city}`,
  }
}

/**
 * Aggiunge in coda le segnalazioni richiamate e il disclaimer obbligatorio.
 * Esportata perché gli atti di seguito si chiudono esattamente allo stesso
 * modo: due code diverse nello stesso fascicolo si notano subito.
 */
export function componiAtto(corpo: string, ctx: ContestoAtto, modello: ModelloAtto): string {
  const righe = [corpo, '', '---', '', '## Segnalazioni richiamate', '']

  for (const c of ctx.citazioni) {
    righe.push(`**[${c.indice}]** ${c.data}${c.luogo ? ` — ${c.luogo}` : ''}`)
  }

  if (modello.riferimenti.length > 0) {
    righe.push('', '## Riferimenti normativi', '')
    for (const r of modello.riferimenti) {
      righe.push(`- **${r.citazione}** — ${r.contenuto}  \n  Fonte: ${r.fonte}`)
    }
  }

  righe.push('', '---', '', `_${DISCLAIMER_AI}_`)

  return righe.join('\n')
}
