import { zodResponseFormat } from 'openai/helpers/zod'

import { createServiceClient } from '@/lib/supabase/service'
import { logger, logAiUsage } from '@/lib/utils/logger'
import {
  EMBED_DIMENSIONS,
  MODEL_EMBED,
  MODEL_TRIAGE,
  getOpenAI,
  stimaCostoEuro,
} from '@/lib/ai/openai'
import { TRIAGE_SYSTEM_PROMPT, TriageSchema, type TriageOutput } from '@/lib/ai/prompts'
import { moderaTesto } from '@/lib/ai/moderazione'
import { anonimizzaTesto, riassumiModifiche } from '@/lib/ai/anonimizza'
import { getSoglie } from '@/lib/config/thresholds'
import { serverEnv } from '@/lib/config/env'
import { internalRequestHeaders } from '@/lib/security/internal'

/**
 * Normalizza un campo testuale opzionale prodotto dal modello.
 *
 * Serve perché uno schema `z.string().nullable()` accetta anche la STRINGA
 * "null": il modello, a cui abbiamo chiesto di scrivere null, ogni tanto scrive
 * le quattro lettere. Senza questo filtro il valore finisce nella colonna
 * `city`, `needsCity` diventa falso (una stringa piena è truthy), il bot non
 * chiede più niente e la segnalazione si raggruppa solo con le altre che hanno
 * lo stesso identico "null". Un guasto silenzioso e difficile da vedere.
 */
function normalizzaCampo(valore: string | null | undefined): string | null {
  if (valore == null) return null
  const testo = valore.trim()
  if (!testo) return null

  const VUOTI = new Set([
    'null', 'none', 'nil', 'undefined', 'n/a', 'na', 'n/d', 'nd', 'n.d.',
    'non specificato', 'non indicato', 'non disponibile', 'sconosciuto',
    'ignoto', '-', '—', '?',
  ])
  if (VUOTI.has(testo.toLowerCase())) return null

  return testo
}

/** Lingua predefinita quando il modello non ne indica una utilizzabile. */
const LINGUA_ITALIANA = 'it'

/**
 * Riduce il campo lingua a un codice ISO 639-1 di due lettere minuscole.
 *
 * Il modello risponde quasi sempre bene, ma «italiano», «IT-it» o la stringa
 * "null" arrivano lo stesso. Quel valore finisce in `citizens.preferred_language`
 * e da lì decide in che lingua il bot parlerà a una persona per sempre: una
 * riga sporca qui si traduce in un cittadino a cui rispondiamo in una lingua
 * che non è la sua.
 */
function normalizzaLingua(valore: string | null | undefined): string {
  const grezzo = normalizzaCampo(valore)
  if (!grezzo) return LINGUA_ITALIANA

  // Accetta anche le forme regionali («it-IT», «pt_BR»): conta la sola lingua.
  const codice = grezzo.toLowerCase().split(/[-_]/)[0] ?? ''
  return /^[a-z]{2}$/.test(codice) ? codice : LINGUA_ITALIANA
}

export interface TriageResult {
  reportId: string
  category: string
  urgency: number
  clustered: boolean
  clusterId: string | null
  actionable: boolean
  /** Il comune resta ignoto: senza, il raggruppamento geografico non funziona. */
  needsCity: boolean
  /** Lingua originale del cittadino, ISO 639-1. 'it' se ha scritto in italiano. */
  language: string
  /**
   * true se la moderazione ha messo la segnalazione in quarantena. Quando è
   * true, `actionable` e `clustered` sono false e nulla prosegue: la
   * segnalazione aspetta una persona, non viene cancellata.
   */
  quarantined: boolean
  /**
   * L'unica domanda specifica che manca per rendere utile la segnalazione,
   * già scritta in italiano e pronta da inviare. null se non manca niente o se
   * una domanda era già stata fatta su questa segnalazione.
   */
  missingDetail: string | null
}

/**
 * Smista una segnalazione: la capisce, la vettorializza, la confronta con le
 * altre e — se assomiglia a un problema già noto nella stessa zona — la unisce
 * a quel gruppo.
 *
 * Il report è già salvato quando questa funzione parte. Se qualcosa qui fallisce,
 * il report resta con status 'nuovo' e il cron di recupero lo ripesca: la
 * segnalazione di un cittadino non si perde mai per un errore nostro.
 */
export async function triageReport(reportId: string): Promise<TriageResult> {
  const sb = createServiceClient()
  const openai = getOpenAI()

  const { data: report, error: erroreLettura } = await sb
    .from('reports')
    // La FK va nominata: da quando citizens.pending_city_report_id punta a
    // reports, fra le due tabelle ci sono DUE relazioni e PostgREST non sa
    // quale intendi (PGRST201). Senza il nome, l'intero triage fallisce.
    .select('*, citizens!reports_citizen_id_fkey(city, neighborhood, preferred_language)')
    .eq('id', reportId)
    .single()

  if (erroreLettura || !report) {
    throw new Error(`Segnalazione ${reportId} non trovata: ${erroreLettura?.message}`)
  }

  // Il comune del cittadino, se lo conosciamo già da una segnalazione
  // precedente. Si chiede una volta sola: chiederlo a ogni messaggio sarebbe
  // un modo sicuro di far smettere di scrivere le persone.
  const cittadino = (
    report as {
      citizens?: {
        city: string | null
        neighborhood: string | null
        preferred_language: string | null
      } | null
    }
  ).citizens

  // --- 1. Estrazione strutturata -------------------------------------------
  const completamento = await openai.chat.completions.parse({
    model: MODEL_TRIAGE,
    messages: [
      { role: 'system', content: TRIAGE_SYSTEM_PROMPT },
      { role: 'user', content: report.raw_text },
    ],
    response_format: zodResponseFormat(TriageSchema, 'triage'),
    temperature: 0,
  })

  const meta = completamento.choices[0]?.message.parsed as TriageOutput | null
  if (!meta) {
    throw new Error(`Il modello non ha prodotto un'estrazione valida per ${reportId}`)
  }

  logAiUsage({
    model: MODEL_TRIAGE,
    operation: 'triage',
    input_tokens: completamento.usage?.prompt_tokens ?? 0,
    output_tokens: completamento.usage?.completion_tokens ?? 0,
    cost_eur: stimaCostoEuro(
      MODEL_TRIAGE,
      completamento.usage?.prompt_tokens ?? 0,
      completamento.usage?.completion_tokens ?? 0,
    ),
    report_id: reportId,
  })

  const lingua = normalizzaLingua(meta.original_language)

  // La domanda di dettaglio si fa UNA volta sola. Se la colonna è già
  // valorizzata l'abbiamo già chiesta: ripeterla a ogni messaggio è il modo più
  // affidabile di far smettere di scrivere una persona.
  const domandaGiaFatta = normalizzaCampo(report.follow_up_question) !== null
  const domandaMancante = domandaGiaFatta ? null : normalizzaCampo(meta.missing_detail)

  // --- 2. Moderazione, PRIMA dell'embedding --------------------------------
  // Prima di spendere e prima di far entrare il testo in un gruppo: una
  // segnalazione che non entrerà mai in un gruppo non merita un embedding, e
  // soprattutto un contenuto offensivo o diffamatorio non deve poter finire
  // citato dentro un atto indirizzato a una Procura.
  //
  // La quarantena NON cancella niente: mette da parte in attesa della revisione
  // umana che avviene nel pannello di amministrazione. È la ragione per cui si
  // può accettare qualche falso positivo su dialetto e turpiloquio non
  // offensivo — «'sta schifezza di strada» non è odio, e una persona lo vedrà.
  const moderazione = await moderaTesto(report.raw_text, reportId)

  if (moderazione.bloccato) {
    const { error: erroreQuarantena } = await sb
      .from('reports')
      .update({
        status: 'quarantena',
        moderation_flagged: true,
        moderation_categories: moderazione.categorie,
        moderation_score: moderazione.punteggio,
        moderated_at: new Date().toISOString(),
        original_language: lingua,
        // Si salva la versione sobria per chi dovrà rivedere, non la versione
        // pubblica: `anon_text` nasce dalla doppia rete di anonimizzazione, e
        // qui la seconda rete non è passata. Se la revisione assolve la
        // segnalazione, il triage rigira e la scrive come si deve.
        clean_text: meta.clean_text,
      })
      .eq('id', reportId)

    // Si rilancia di proposito: se la quarantena non è stata scritta, la
    // segnalazione è ancora 'nuovo' e il cron la riprenderà. Restituire
    // «messa da parte» a fronte di una riga che nel database è rimasta
    // ordinaria significherebbe credere di aver fermato un contenuto che
    // invece prosegue verso un gruppo e verso un atto.
    if (erroreQuarantena) {
      throw new Error(`Quarantena non salvata per ${reportId}: ${erroreQuarantena.message}`)
    }

    logger.warn('triage.quarantena', {
      report_id: reportId,
      categorie: moderazione.categorie,
      punteggio: moderazione.punteggio,
    })

    return {
      reportId,
      category: meta.category,
      urgency: meta.urgency,
      clustered: false,
      clusterId: null,
      actionable: false,
      needsCity: false,
      language: lingua,
      quarantined: true,
      missingDetail: null,
    }
  }

  // Un saluto o una prova non entra nel flusso civico: si archivia e basta.
  // La domanda di dettaglio però si salva e si restituisce: al cittadino che ha
  // scritto «guasto elettrico» serve sapere che cosa manca, non un invito
  // generico a essere più preciso.
  if (!meta.is_actionable) {
    const { error: erroreArchivio } = await sb
      .from('reports')
      .update({
        status: 'archiviato',
        triaged_at: new Date().toISOString(),
        original_language: lingua,
        ...(domandaMancante ? { follow_up_question: domandaMancante } : {}),
      })
      .eq('id', reportId)

    if (erroreArchivio) {
      throw new Error(`Archiviazione non salvata per ${reportId}: ${erroreArchivio.message}`)
    }

    await aggiornaProfiloCittadino(report.citizen_id, cittadino, lingua)

    logger.info('triage.non_azionabile', { report_id: reportId, lingua })
    return {
      reportId,
      category: meta.category,
      urgency: meta.urgency,
      clustered: false,
      clusterId: null,
      actionable: false,
      needsCity: false,
      language: lingua,
      quarantined: false,
      missingDetail: domandaMancante,
    }
  }

  // --- 3. Embedding sul testo ripulito -------------------------------------
  // Sul clean_text e non sul grezzo: toglie il rumore di ortografia, dialetto e
  // sfogo, e rende i gruppi molto più stabili. Vale doppio da quando si accetta
  // più di una lingua: il clean_text è sempre italiano, quindi la segnalazione
  // di chi scrive in arabo si confronta davvero con quella del suo vicino.
  const embedding = await openai.embeddings.create({
    model: MODEL_EMBED,
    input: meta.clean_text,
  })

  const vettore = embedding.data[0]?.embedding
  if (!vettore || vettore.length !== EMBED_DIMENSIONS) {
    throw new Error(`Embedding di dimensione inattesa per ${reportId}`)
  }

  logAiUsage({
    model: MODEL_EMBED,
    operation: 'embedding',
    input_tokens: embedding.usage?.prompt_tokens ?? 0,
    output_tokens: 0,
    cost_eur: stimaCostoEuro(MODEL_EMBED, embedding.usage?.prompt_tokens ?? 0),
    report_id: reportId,
  })

  // Priorità: quello che ha scritto ora > quello che sappiamo di lui > quello
  // che era già sulla segnalazione.
  const citta =
    normalizzaCampo(meta.city) ?? cittadino?.city ?? report.city ?? null
  const quartiere =
    normalizzaCampo(meta.neighborhood) ?? cittadino?.neighborhood ?? report.neighborhood ?? null
  const luogo = normalizzaCampo(meta.location_hint) ?? report.location_hint

  // --- 4. Seconda rete sull'anonimizzazione --------------------------------
  // `anon_text` è l'unico testo che compare in pagina pubblica e dentro un
  // atto. Non si salva più il campo grezzo del triage: passa dalle regole
  // deterministiche e da un secondo modello dedicato (PLAN2 §5.1).
  const anonimizzato = await anonimizzaTesto(meta.anon_text, reportId)
  const redazioni = riassumiModifiche(anonimizzato.modifiche)

  // --- 5. Cerca un gruppo esistente ----------------------------------------
  // I filtri di città/quartiere e categoria non sono un dettaglio: due
  // segnalazioni di "buche in strada" in quartieri diversi NON sono lo stesso
  // problema, per quanto i loro testi si somiglino.
  const { data: simili, error: erroreMatch } = await sb.rpc('match_similar_reports', {
    query_embedding: JSON.stringify(vettore),
    match_threshold: getSoglie().similarityAssign,
    match_count: 20,
    // I parametri della RPC accettano `undefined` per "nessun filtro": una
    // colonna vuota nel database è `null`, che qui va convertito.
    filter_city: citta ?? undefined,
    filter_neighborhood: quartiere ?? undefined,
    filter_category: meta.category,
  })

  if (erroreMatch) {
    logger.warn('triage.match_fallito', { report_id: reportId, errore: erroreMatch.message })
  }

  // Il gruppo più rappresentato fra le segnalazioni simili vince.
  const voti = new Map<string, number>()
  for (const riga of simili ?? []) {
    if (riga.cluster_id && riga.report_id !== reportId) {
      voti.set(riga.cluster_id, (voti.get(riga.cluster_id) ?? 0) + 1)
    }
  }
  const clusterDaSimilarita = [...voti.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  // Ritorno dalla quarantena: se questa segnalazione era già stata giudicata
  // simile a un gruppo, ci torna. Farle ricominciare il giro da capo la
  // lascerebbe orfana per giorni — e il gruppo, nel frattempo, ha perso un
  // cittadino distinto e può essere sceso sotto la soglia di pubblicazione.
  const clusterRitrovato = await riagganciaDopoQuarantena(
    report.previous_cluster_id,
    meta.category,
    reportId,
  )

  let clusterId: string | null = clusterRitrovato ?? clusterDaSimilarita

  // Il trigger `reports_before_quarantine` stacca dal gruppo qualunque riga con
  // `moderation_flagged = true`, a prescindere dallo stato. Scrivere comunque
  // un cluster_id qui produrrebbe un salvataggio che il database annulla in
  // silenzio, e un log che dice il contrario di quello che è successo.
  if (report.moderation_flagged && clusterId) {
    logger.warn('triage.gruppo_non_assegnato_flag_moderazione', {
      report_id: reportId,
      cluster_id: clusterId,
    })
    clusterId = null
  }

  // --- 6. Salva --------------------------------------------------------------
  await sb.from('report_embeddings').upsert(
    {
      report_id: reportId,
      embedding: JSON.stringify(vettore),
      model: MODEL_EMBED,
    },
    { onConflict: 'report_id' },
  )

  const { error: erroreUpdate } = await sb
    .from('reports')
    .update({
      category: meta.category,
      urgency: meta.urgency,
      clean_text: meta.clean_text,
      anon_text: anonimizzato.testo,
      location_hint: luogo,
      city: citta,
      neighborhood: quartiere,
      status: clusterId ? 'clustered' : 'triaged',
      cluster_id: clusterId,
      triaged_at: new Date().toISOString(),
      original_language: lingua,
      // Le tracce della doppia rete. Senza queste due colonne «abbiamo
      // l'anonimizzazione doppia» resta un'affermazione che nessuno può
      // verificare; con queste è una query.
      anon_reviewed_at: anonimizzato.revisionato ? new Date().toISOString() : null,
      anon_redactions: redazioni.length > 0 ? redazioni : null,
      // Il riaggancio consuma la memoria della quarantena: lasciarla lì
      // farebbe ripetere il tentativo a ogni ri-triage successivo.
      ...(clusterRitrovato && clusterId === clusterRitrovato
        ? { previous_cluster_id: null }
        : {}),
      ...(domandaMancante ? { follow_up_question: domandaMancante } : {}),
    })
    .eq('id', reportId)

  if (erroreUpdate) throw new Error(`Salvataggio triage fallito: ${erroreUpdate.message}`)

  await aggiornaProfiloCittadino(report.citizen_id, cittadino, lingua, {
    city: normalizzaCampo(meta.city) ? citta : null,
    neighborhood: normalizzaCampo(meta.city) ? quartiere : null,
  })

  logger.info('triage.completato', {
    report_id: reportId,
    category: meta.category,
    urgency: meta.urgency,
    cluster_id: clusterId,
    lingua,
    anon_correzioni: anonimizzato.correzioni,
  })

  // --- 7. Soglia di azione ---------------------------------------------------
  if (clusterId) await valutaSogliaAzione(clusterId)

  return {
    reportId,
    category: meta.category,
    urgency: meta.urgency,
    clustered: Boolean(clusterId),
    clusterId,
    actionable: true,
    needsCity: !citta,
    language: lingua,
    quarantined: false,
    missingDetail: domandaMancante,
  }
}

/**
 * Riporta nel suo gruppo una segnalazione uscita dalla quarantena.
 *
 * Il trigger `reports_before_quarantine` salva in `previous_cluster_id` il
 * gruppo da cui la moderazione l'aveva staccata. Quando una revisione la
 * assolve, quel gruppo è ancora la risposta giusta: era già stato giudicato
 * simile, e il calcolo di similarità appena fatto potrebbe non ritrovarlo se
 * nel frattempo il gruppo è cresciuto in un'altra direzione.
 *
 * Si controlla comunque che il gruppo esista ancora e che parli della stessa
 * categoria: la revisione umana può aver riclassificato il testo, e rimettere
 * una segnalazione di sanità dentro un gruppo di mobilità sarebbe peggio che
 * lasciarla sola.
 */
async function riagganciaDopoQuarantena(
  previousClusterId: string | null,
  categoria: string,
  reportId: string,
): Promise<string | null> {
  if (!previousClusterId) return null

  const sb = createServiceClient()
  const { data: gruppo, error } = await sb
    .from('clusters')
    .select('id, category, status')
    .eq('id', previousClusterId)
    .maybeSingle()

  if (error) {
    logger.warn('triage.riaggancio_fallito', {
      report_id: reportId,
      cluster_id: previousClusterId,
      error,
    })
    return null
  }

  if (!gruppo || gruppo.category !== categoria) {
    logger.info('triage.riaggancio_non_applicabile', {
      report_id: reportId,
      cluster_id: previousClusterId,
      motivo: gruppo ? 'categoria_diversa' : 'gruppo_inesistente',
    })
    return null
  }

  logger.info('triage.riagganciata_dopo_quarantena', {
    report_id: reportId,
    cluster_id: gruppo.id,
  })
  return gruppo.id
}

/**
 * Aggiorna ciò che sappiamo di un cittadino: il suo comune e la lingua in cui
 * gli parliamo.
 *
 * Entrambe si imparano una volta e non si chiedono più. La lingua si scrive
 * solo se non ne aveva già una: quella scelta appartiene alla persona, e una
 * segnalazione scritta in fretta in un'altra lingua non deve cambiare in che
 * lingua il bot le parlerà da domani.
 */
async function aggiornaProfiloCittadino(
  citizenId: string | null,
  cittadino: { city: string | null; preferred_language: string | null } | null | undefined,
  lingua: string,
  luogo?: { city: string | null; neighborhood: string | null },
): Promise<void> {
  if (!citizenId) return

  const modifiche: { city?: string; neighborhood?: string | null; preferred_language?: string } = {}

  if (luogo?.city && !cittadino?.city) {
    modifiche.city = luogo.city
    modifiche.neighborhood = luogo.neighborhood
  }

  // Solo per chi non ha scritto in italiano: `preferred_language` a null
  // significa già «rispondile in italiano», e riempirlo per tutti renderebbe
  // impossibile distinguere una scelta da un valore predefinito.
  if (lingua !== LINGUA_ITALIANA && !cittadino?.preferred_language) {
    modifiche.preferred_language = lingua
  }

  if (Object.keys(modifiche).length === 0) return

  const sb = createServiceClient()
  const { error } = await sb.from('citizens').update(modifiche).eq('id', citizenId)

  if (error) {
    // Non si rilancia: la segnalazione è salva e questo è un miglioramento del
    // profilo, non una condizione per proseguire.
    logger.warn('triage.profilo_cittadino_non_aggiornato', { citizen_id: citizenId, error })
  }
}

/**
 * Quando un gruppo supera la soglia di cittadini DISTINTI, passa ad "attivo" e
 * si generano le bozze degli atti.
 *
 * Conta persone, non messaggi: chi scrive trenta volte non è un movimento.
 */
export async function valutaSogliaAzione(clusterId: string): Promise<void> {
  const sb = createServiceClient()

  const { data: gruppo } = await sb
    .from('clusters')
    .select('id, status, citizens_count')
    .eq('id', clusterId)
    .single()

  if (!gruppo || gruppo.status !== 'emergente') return
  if ((gruppo.citizens_count ?? 0) < getSoglie().actionThresholdCitizens) return

  await sb
    .from('clusters')
    .update({ status: 'attivo', threshold_reached_at: new Date().toISOString() })
    .eq('id', clusterId)

  logger.info('cluster.soglia_raggiunta', {
    cluster_id: clusterId,
    citizens_count: gruppo.citizens_count,
  })

  // La generazione degli atti parte come richiesta HTTP separata, non come
  // chiamata diretta: sono quattro chiamate al modello, e sommate al triage
  // che sta già girando dentro un `after()` sforerebbero il minuto concesso
  // alla funzione. Così ciascuna parte ha il suo budget.
  //
  // Se questa chiamata si perde, il cron dossier-refresh ripesca il gruppo:
  // per questo l'errore si logga e non si rilancia.
  try {
    const risposta = await fetch(`${serverEnv.APP_URL}/api/internal/generate-dossier`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...internalRequestHeaders() },
      body: JSON.stringify({ clusterId }),
    })
    if (!risposta.ok) {
      logger.warn('cluster.generazione_atti_rifiutata', {
        cluster_id: clusterId,
        status: risposta.status,
      })
    }
  } catch (errore) {
    logger.warn('cluster.generazione_atti_non_avviata', {
      cluster_id: clusterId,
      messaggio: errore instanceof Error ? errore.message : String(errore),
    })
  }
}
