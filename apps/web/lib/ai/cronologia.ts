/**
 * Cronologia del gruppo (PLAN2 §3.3).
 *
 * Un gruppo, oggi, è una fotografia: titolo, riassunto, due contatori. Chi apre
 * la pagina non sa quando è cominciato, come è cresciuto, cosa è successo dopo
 * l'invio dell'atto. Per un cittadino è la differenza fra «c'è una pagina» e
 * «sta succedendo qualcosa»; per un giornalista è la differenza fra un dato e
 * una storia.
 *
 * TRE VINCOLI CHE DECIDONO LA FORMA DI QUESTO FILE.
 *
 * 1. Nessun fatto nuovo entra da qui. Il materiale è solo ciò che è già
 *    pubblicabile: `anon_text` (mai `raw_text`), date, contatori, atti e
 *    risposte della PA già confermate da una persona. Se un fatto non era
 *    pubblicabile prima, non lo diventa perché è dentro una cronologia.
 *
 * 2. Nessuna singola segnalazione viene ricopiata. Il commento della colonna
 *    `clusters.timeline_markdown` lo dice esplicitamente, ed è la stessa
 *    disciplina di CLUSTER_SUMMARY_SYSTEM_PROMPT: un dettaglio che compare in
 *    una sola segnalazione identifica chi l'ha scritta, anche dopo
 *    l'anonimizzazione. Gli `anon_text` entrano nel prompt come materiale, non
 *    come citazioni: il prompt vieta di riportarli parola per parola.
 *
 * 3. Una chiamata per gruppo al giorno, non per pagina vista. Il costo
 *    dichiarato in PLAN2 è questo e va rispettato: la cronologia si scrive nel
 *    database e si legge da lì, e un intervallo minimo protegge il budget anche
 *    se qualcuno richiama il cron dieci volte di seguito.
 *
 * La cronologia descrive, non giudica. «L'amministrazione non ha risposto entro
 * il termine» è un fatto; «l'amministrazione ha ignorato i cittadini» è
 * un'accusa che nessun cittadino ha firmato.
 */

import {
  ACTION_KIND_LABELS,
  ACTION_STATUS_LABELS,
  CATEGORY_LABELS,
  CLUSTER_STATUS_LABELS,
  PA_RESPONSE_CLASS_LABELS,
  type ActionKind,
  type ActionStatus,
} from '@voce/db'

import { createServiceClient } from '@/lib/supabase/service'
import { MODEL_DOSSIER, getOpenAI, stimaCostoEuro } from '@/lib/ai/openai'
import { getSoglie } from '@/lib/config/thresholds'
import { logAiUsage, logger, serializeError } from '@/lib/utils/logger'

/**
 * Intervallo minimo fra due rigenerazioni dello stesso gruppo.
 *
 * PLAN2 §3.3 dichiara «una chiamata per gruppo al giorno». Venti ore, non
 * ventiquattro: un cron giornaliero che slitta di qualche minuto non deve
 * saltare un gruppo per un'ora di differenza.
 */
export const CRONOLOGIA_INTERVALLO_MINIMO_MS = 20 * 60 * 60 * 1000

/** Segnalazioni lette per costruire il materiale del prompt. */
const MAX_SEGNALAZIONI_LETTE = 200

/** Segnalazioni effettivamente passate al modello, campionate sull'arco. */
const MAX_SEGNALAZIONI_NEL_PROMPT = 40

/** Caratteri per segnalazione: un racconto lungo non deve mangiarsi il budget. */
const MAX_CARATTERI_PER_SEGNALAZIONE = 400

/** Tetto di sicurezza sul testo salvato. Il prompt ne chiede molto meno. */
const MAX_CARATTERI_CRONOLOGIA = 3000

/** Tappe ammesse. Oltre questa soglia non è più una cronologia, è un diario. */
const MAX_TAPPE = 10

export interface EsitoCronologia {
  clusterId: string
  aggiornato: boolean
  /** Perché non è stata aggiornata. null quando è andata a buon fine. */
  motivo: string | null
}

export interface EsitoCronologiaLotto {
  esaminati: number
  aggiornati: number
  saltati: number
  falliti: number
  interrottoPerTempo: boolean
}

const CRONOLOGIA_SYSTEM_PROMPT = `Scrivi la cronologia di un gruppo di segnalazioni di cittadini italiani su un problema del loro quartiere.

Ricevi solo fatti già pubblici: date, conteggi, testi di segnalazioni già anonimizzati, atti indirizzati alla pubblica amministrazione, risposte già confermate da una persona.

FORMATO
- Solo un elenco puntato Markdown. Niente titoli, niente introduzione, niente frase di chiusura.
- Al massimo ${MAX_TAPPE} tappe, in ordine cronologico.
- Ogni tappa comincia con il periodo in grassetto: "- **marzo 2026** — cosa è successo".
- Una o due frasi per tappa. Frasi brevi, al massimo quindici parole ciascuna.

COSA PUOI SCRIVERE
- Quando sono arrivate le prime segnalazioni e in quale zona.
- Come è cresciuto il gruppo, usando solo i numeri che ti vengono dati.
- I problemi che ricorrono in più segnalazioni diverse.
- Gli atti preparati, revisionati e inviati, con la data e il destinatario.
- Le risposte dell'amministrazione già confermate e il loro esito.

COSA NON PUOI FARE
- Non inventare date, numeri, percentuali, luoghi o fatti. Se un dato non c'è, non nominarlo.
- Non scrivere nomi di persona, numeri civici, targhe, recapiti.
- Non riportare una singola segnalazione parola per parola: descrivi ciò che ricorre. Un dettaglio presente in una sola segnalazione può identificare chi l'ha scritta.
- Non giudicare e non attribuire colpe. "Non è arrivata risposta entro il termine" sì; "il Comune ha ignorato i cittadini" no.
- Non proporre soluzioni tecniche al problema e non promettere niente sul futuro.
- Niente emoji, niente slogan, niente punti esclamativi.`

/**
 * Rigenera la cronologia di un gruppo e la salva.
 *
 * `forza` esiste solo per il richiamo manuale durante la taratura del prompt:
 * il cron non lo usa mai, altrimenti il costo dichiarato salterebbe.
 */
export async function aggiornaCronologia(
  clusterId: string,
  opzioni?: { forza?: boolean },
): Promise<EsitoCronologia> {
  const log = logger.child({ cluster_id: clusterId, job: 'cronologia' })
  const sb = createServiceClient()
  const soglie = getSoglie()

  const { data: cluster, error: erroreCluster } = await sb
    .from('clusters')
    // Una sola stringa letterale, senza concatenazioni: supabase-js ricava i
    // tipi delle colonne dal letterale, e un `+` gli restituisce `string`.
    .select('id, title, summary, category, city, neighborhood, status, is_synthetic, reports_count, citizens_count, threshold_reached_at, created_at, updated_at, timeline_updated_at')
    .eq('id', clusterId)
    .maybeSingle()

  if (erroreCluster) {
    log.error('cronologia.lettura_gruppo_fallita', { error: erroreCluster })
    throw new Error(`Lettura del gruppo ${clusterId} fallita: ${erroreCluster.message}`)
  }
  if (!cluster) {
    return { clusterId, aggiornato: false, motivo: 'gruppo inesistente' }
  }

  // Un gruppo sintetico non ha una storia da raccontare a nessuno: i dati di
  // prova non entrano in nessun output pubblico, e la cronologia è pubblica.
  if (cluster.is_synthetic) {
    return { clusterId, aggiornato: false, motivo: 'gruppo sintetico' }
  }

  // Sotto la soglia di privacy il gruppo non è visibile: scrivere la sua storia
  // sarebbe una chiamata pagata per un testo che nessuno può leggere, e un
  // testo pronto a diventare pubblico nell'istante in cui arriva il terzo
  // cittadino, senza che nessuno lo abbia riletto.
  if ((cluster.citizens_count ?? 0) < soglie.minPublicCitizens) {
    return { clusterId, aggiornato: false, motivo: 'sotto la soglia pubblica' }
  }

  if (!opzioni?.forza && !intervalloRispettato(cluster.timeline_updated_at)) {
    return { clusterId, aggiornato: false, motivo: 'aggiornata da meno di venti ore' }
  }

  // --- Materiale -----------------------------------------------------------
  // Solo `anon_text`: il testo grezzo non esce da `reports`, mai, per nessun
  // motivo. `location_hint` resta fuori per la stessa ragione per cui non entra
  // negli atti: è testo grezzo del cittadino e può contenere un civico.
  const { data: segnalazioni, error: erroreSegnalazioni } = await sb
    .from('reports')
    .select('anon_text, created_at')
    .eq('cluster_id', clusterId)
    .eq('is_synthetic', false)
    .not('anon_text', 'is', null)
    .order('created_at', { ascending: true })
    .limit(MAX_SEGNALAZIONI_LETTE)

  if (erroreSegnalazioni) {
    log.error('cronologia.lettura_segnalazioni_fallita', { error: erroreSegnalazioni })
    throw new Error(`Lettura delle segnalazioni fallita: ${erroreSegnalazioni.message}`)
  }

  const righeSegnalazioni = segnalazioni ?? []
  if (righeSegnalazioni.length === 0) {
    return { clusterId, aggiornato: false, motivo: 'nessuna segnalazione pubblicabile' }
  }

  const { data: atti, error: erroreAtti } = await sb
    .from('actions')
    .select('id, kind, status, recipient, created_at, reviewed_at, submitted_at, deadline_at, response_received_at')
    .eq('cluster_id', clusterId)
    .eq('is_synthetic', false)
    .order('created_at', { ascending: true })
    .limit(50)

  if (erroreAtti) {
    log.error('cronologia.lettura_atti_fallita', { error: erroreAtti })
    throw new Error(`Lettura degli atti fallita: ${erroreAtti.message}`)
  }

  const righeAtti = atti ?? []

  // Solo le risposte confermate da una persona, e solo nelle colonne _anon.
  // Una classificazione mai riletta trasformerebbe la cronologia in un'accusa
  // pubblica: «non ha risposto» a un comune che aveva risposto.
  const risposte = await leggiRisposteConfermate(righeAtti.map((a) => a.id))

  const materiale = componiMateriale({
    cluster,
    segnalazioni: righeSegnalazioni,
    atti: righeAtti,
    risposte,
  })

  // --- Generazione ---------------------------------------------------------
  // MODEL_DOSSIER e non MODEL_TRIAGE: è testo narrativo destinato a una pagina
  // pubblica, la stessa famiglia di output degli atti. Oggi puntano allo stesso
  // modello, ma il giorno in cui uno dei due cambia questa riga deve seguire
  // gli atti, non lo smistamento.
  const openai = getOpenAI()
  const completamento = await openai.chat.completions.create({
    model: MODEL_DOSSIER,
    messages: [
      { role: 'system', content: CRONOLOGIA_SYSTEM_PROMPT },
      { role: 'user', content: materiale },
    ],
    temperature: 0.2,
  })

  const tokenInput = completamento.usage?.prompt_tokens ?? 0
  const tokenOutput = completamento.usage?.completion_tokens ?? 0

  logAiUsage({
    model: MODEL_DOSSIER,
    operation: 'cronologia',
    input_tokens: tokenInput,
    output_tokens: tokenOutput,
    cost_eur: stimaCostoEuro(MODEL_DOSSIER, tokenInput, tokenOutput),
    cluster_id: clusterId,
  })

  const grezzo = completamento.choices[0]?.message.content ?? ''
  const testo = normalizzaCronologia(grezzo)

  if (!testo) {
    log.warn('cronologia.testo_vuoto')
    return { clusterId, aggiornato: false, motivo: 'il modello non ha prodotto testo' }
  }

  // `updated_at` NON si tocca: è il segnale che dice al cron quali gruppi sono
  // cambiati. Scriverlo qui farebbe sembrare cambiato ogni gruppo appena
  // rigenerato, e il cron rifarebbe lo stesso lavoro ogni notte.
  const { error: erroreScrittura } = await sb
    .from('clusters')
    .update({ timeline_markdown: testo, timeline_updated_at: new Date().toISOString() })
    .eq('id', clusterId)

  if (erroreScrittura) {
    log.error('cronologia.scrittura_fallita', { error: erroreScrittura })
    throw new Error(`Salvataggio della cronologia fallito: ${erroreScrittura.message}`)
  }

  log.info('cronologia.aggiornata', {
    segnalazioni: righeSegnalazioni.length,
    atti: righeAtti.length,
    risposte: risposte.length,
    caratteri: testo.length,
  })

  return { clusterId, aggiornato: true, motivo: null }
}

/**
 * Rigenera le cronologie dei gruppi che ne hanno bisogno.
 *
 * «Ne hanno bisogno» significa due cose diverse, e servono entrambe:
 *
 *   · il gruppo è cambiato — `clusters.updated_at` si muove a ogni ricalcolo
 *     dei contatori, cioè a ogni segnalazione nuova;
 *   · un ATTO del gruppo è cambiato — ed è il caso che PLAN2 §3.3 chiede
 *     esplicitamente di raccontare («cosa è cambiato dopo l'invio dell'atto»).
 *     Inviare un atto non tocca `clusters.updated_at`: senza questa seconda
 *     ricerca la tappa più importante non entrerebbe mai in cronologia.
 */
export async function aggiornaCronologiePendenti(): Promise<EsitoCronologiaLotto> {
  const soglie = getSoglie()
  const inizio = Date.now()

  const esito: EsitoCronologiaLotto = {
    esaminati: 0,
    aggiornati: 0,
    saltati: 0,
    falliti: 0,
    interrottoPerTempo: false,
  }

  const candidati = await selezionaGruppiDaAggiornare(soglie.cronBatchSize)

  for (const clusterId of candidati) {
    // Meglio fermarsi e riprendere domani che farsi troncare dalla piattaforma
    // a metà, senza scrivere l'esito: un job che fallisce in silenzio insegna a
    // ignorare gli allarmi.
    if (Date.now() - inizio > soglie.cronTimeBudgetMs) {
      esito.interrottoPerTempo = true
      break
    }

    esito.esaminati += 1

    try {
      const risultato = await aggiornaCronologia(clusterId)
      if (risultato.aggiornato) {
        esito.aggiornati += 1
      } else {
        esito.saltati += 1
        logger.info('cronologia.saltata', {
          cluster_id: clusterId,
          job: 'cronologia',
          motivo: risultato.motivo,
        })
      }
    } catch (errore) {
      // Un gruppo che fallisce non ferma gli altri: la cronologia resta quella
      // di ieri, che è vecchia ma vera, e il giro successivo riprova.
      esito.falliti += 1
      logger.error('cronologia.fallita', {
        cluster_id: clusterId,
        job: 'cronologia',
        ...serializeError(errore),
      })
    }
  }

  return esito
}

// ---------------------------------------------------------------------------
// Selezione
// ---------------------------------------------------------------------------

function intervalloRispettato(timelineUpdatedAt: string | null): boolean {
  if (!timelineUpdatedAt) return true
  return Date.now() - new Date(timelineUpdatedAt).getTime() >= CRONOLOGIA_INTERVALLO_MINIMO_MS
}

/**
 * Id dei gruppi da rigenerare, in ordine di bisogno.
 *
 * L'ordinamento mette per primi i gruppi che non hanno mai avuto una
 * cronologia, poi quelli con la cronologia più vecchia. Ordinare per
 * `updated_at` premierebbe sempre gli stessi gruppi molto attivi, e un gruppo
 * piccolo non vedrebbe mai la sua storia.
 *
 * Il confronto fra due colonne (`updated_at > timeline_updated_at`) non è
 * esprimibile in PostgREST: si legge un sovrainsieme limitato e si filtra qui.
 */
async function selezionaGruppiDaAggiornare(limite: number): Promise<string[]> {
  const sb = createServiceClient()
  const soglie = getSoglie()

  const { data: gruppi, error } = await sb
    .from('clusters')
    .select('id, updated_at, timeline_updated_at')
    .eq('is_synthetic', false)
    .gte('citizens_count', soglie.minPublicCitizens)
    .order('timeline_updated_at', { ascending: true, nullsFirst: true })
    .limit(limite * 5)

  if (error) throw new Error(`Selezione dei gruppi fallita: ${error.message}`)

  const scelti: string[] = []
  const gia = new Set<string>()

  for (const g of gruppi ?? []) {
    if (!intervalloRispettato(g.timeline_updated_at)) continue
    if (g.timeline_updated_at && g.updated_at <= g.timeline_updated_at) continue
    if (gia.has(g.id)) continue
    gia.add(g.id)
    scelti.push(g.id)
    if (scelti.length >= limite) return scelti
  }

  // Secondo passaggio: gruppi fermi come contatori ma con un atto che si è
  // mosso di recente. È qui che entrano «atto inviato» e «risposta ricevuta».
  const dueGiorniFa = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()

  const { data: attiRecenti, error: erroreAtti } = await sb
    .from('actions')
    .select('cluster_id, created_at, reviewed_at, submitted_at, response_received_at')
    .eq('is_synthetic', false)
    .or(
      `created_at.gte.${dueGiorniFa},reviewed_at.gte.${dueGiorniFa},` +
        `submitted_at.gte.${dueGiorniFa},response_received_at.gte.${dueGiorniFa}`,
    )
    .limit(200)

  if (erroreAtti) throw new Error(`Selezione degli atti recenti fallita: ${erroreAtti.message}`)

  const idoneo = new Map(
    (gruppi ?? []).map((g) => [g.id, g.timeline_updated_at] as const),
  )

  for (const atto of attiRecenti ?? []) {
    if (scelti.length >= limite) break
    if (gia.has(atto.cluster_id)) continue
    if (!idoneo.has(atto.cluster_id)) continue

    const timeline = idoneo.get(atto.cluster_id) ?? null
    if (!intervalloRispettato(timeline)) continue

    const ultimoMovimento = [
      atto.created_at,
      atto.reviewed_at,
      atto.submitted_at,
      atto.response_received_at,
    ]
      .filter((v): v is string => Boolean(v))
      .sort()
      .at(-1)

    if (timeline && (!ultimoMovimento || ultimoMovimento <= timeline)) continue

    gia.add(atto.cluster_id)
    scelti.push(atto.cluster_id)
  }

  return scelti
}

// ---------------------------------------------------------------------------
// Materiale per il modello
// ---------------------------------------------------------------------------

interface RigaSegnalazione {
  anon_text: string | null
  created_at: string
}

interface RigaAtto {
  id: string
  kind: ActionKind
  status: ActionStatus
  recipient: string | null
  created_at: string
  reviewed_at: string | null
  submitted_at: string | null
  deadline_at: string | null
  response_received_at: string | null
}

interface RigaRisposta {
  action_id: string
  classification: keyof typeof PA_RESPONSE_CLASS_LABELS | null
  reason_anon: string | null
  cites_art_5bis: boolean
  received_at: string
}

async function leggiRisposteConfermate(actionIds: string[]): Promise<RigaRisposta[]> {
  if (actionIds.length === 0) return []

  const sb = createServiceClient()
  const { data, error } = await sb
    .from('action_responses')
    .select('action_id, classification, reason_anon, cites_art_5bis, received_at')
    .in('action_id', actionIds)
    .not('confirmed_by', 'is', null)
    .not('classification', 'is', null)
    .order('received_at', { ascending: true })
    .limit(50)

  if (error) throw new Error(`Lettura delle risposte fallita: ${error.message}`)
  return (data ?? []) as RigaRisposta[]
}

const FORMATO_DATA = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const FORMATO_MESE = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' })

function data(valore: string | null): string {
  return valore ? FORMATO_DATA.format(new Date(valore)) : 'data non disponibile'
}

function mese(valore: string): string {
  return FORMATO_MESE.format(new Date(valore))
}

/**
 * Campiona le segnalazioni sull'intero arco temporale.
 *
 * Prendere le prime N taglierebbe fuori proprio il periodo recente, che è la
 * parte di storia che il cittadino sta aspettando di leggere.
 */
function campiona<T>(righe: T[], massimo: number): T[] {
  if (righe.length <= massimo) return righe
  const passo = righe.length / massimo
  const scelte: T[] = []
  for (let i = 0; i < massimo; i += 1) {
    const riga = righe[Math.floor(i * passo)]
    if (riga !== undefined) scelte.push(riga)
  }
  return scelte
}

function componiMateriale(input: {
  cluster: {
    title: string
    summary: string
    category: string
    city: string
    neighborhood: string | null
    status: keyof typeof CLUSTER_STATUS_LABELS
    reports_count: number
    citizens_count: number
    threshold_reached_at: string | null
    created_at: string
  }
  segnalazioni: RigaSegnalazione[]
  atti: RigaAtto[]
  risposte: RigaRisposta[]
}): string {
  const { cluster, segnalazioni, atti, risposte } = input
  const righe: string[] = []

  righe.push('DATI DEL GRUPPO')
  righe.push(`Titolo: ${cluster.title}`)
  righe.push(`Riassunto: ${cluster.summary}`)
  righe.push(`Tema: ${CATEGORY_LABELS[cluster.category] ?? 'Altro'}`)
  righe.push(
    `Luogo: ${cluster.city}${cluster.neighborhood ? ` — ${cluster.neighborhood}` : ''}`,
  )
  righe.push(`Stato attuale: ${CLUSTER_STATUS_LABELS[cluster.status]}`)
  righe.push(`Gruppo aperto il ${data(cluster.created_at)}`)
  righe.push(
    `Totali a oggi: ${cluster.reports_count} segnalazioni, ` +
      `${cluster.citizens_count} cittadini distinti`,
  )
  if (cluster.threshold_reached_at) {
    righe.push(
      `Soglia per la preparazione degli atti raggiunta il ${data(cluster.threshold_reached_at)}`,
    )
  }

  // --- Crescita ------------------------------------------------------------
  const perMese = new Map<string, { etichetta: string; n: number }>()
  for (const s of segnalazioni) {
    const chiave = s.created_at.slice(0, 7)
    const voce = perMese.get(chiave) ?? { etichetta: mese(s.created_at), n: 0 }
    voce.n += 1
    perMese.set(chiave, voce)
  }

  righe.push('', 'CRESCITA MESE PER MESE')
  for (const [, voce] of [...perMese.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    righe.push(`- ${voce.etichetta}: ${voce.n} segnalazioni`)
  }
  if (segnalazioni.length < cluster.reports_count) {
    righe.push(
      `(conteggio parziale: sono state lette le prime ${segnalazioni.length} segnalazioni ` +
        'su un totale maggiore. Usa i totali indicati sopra per i numeri complessivi.)',
    )
  }

  // --- Racconti ------------------------------------------------------------
  righe.push('', 'SEGNALAZIONI (testi già anonimizzati, in ordine di arrivo)')
  righe.push('Materiale di lavoro: non riportarli parola per parola.')
  for (const s of campiona(segnalazioni, MAX_SEGNALAZIONI_NEL_PROMPT)) {
    const testo = (s.anon_text ?? '').replace(/\s+/g, ' ').trim()
    if (!testo) continue
    righe.push(`- ${data(s.created_at)}: ${testo.slice(0, MAX_CARATTERI_PER_SEGNALAZIONE)}`)
  }

  // --- Atti ----------------------------------------------------------------
  if (atti.length > 0) {
    righe.push('', 'ATTI DEL GRUPPO')
    for (const a of atti) {
      const parti = [
        `${ACTION_KIND_LABELS[a.kind] ?? a.kind}`,
        `stato: ${ACTION_STATUS_LABELS[a.status] ?? a.status}`,
        `preparato il ${data(a.created_at)}`,
      ]
      if (a.recipient) parti.push(`destinatario: ${a.recipient}`)
      if (a.reviewed_at) parti.push(`revisionato il ${data(a.reviewed_at)}`)
      if (a.submitted_at) parti.push(`inviato il ${data(a.submitted_at)}`)
      if (a.deadline_at) parti.push(`termine di legge: ${data(a.deadline_at)}`)
      if (a.response_received_at) {
        parti.push(`risposta ricevuta il ${data(a.response_received_at)}`)
      }
      righe.push(`- ${parti.join('; ')}`)
    }
  } else {
    righe.push('', 'ATTI DEL GRUPPO: nessuno finora.')
  }

  // --- Risposte ------------------------------------------------------------
  if (risposte.length > 0) {
    const perAtto = new Map(atti.map((a) => [a.id, a] as const))
    righe.push('', 'RISPOSTE DELL\'AMMINISTRAZIONE (già confermate da una persona)')
    for (const r of risposte) {
      const atto = perAtto.get(r.action_id)
      const parti = [
        `risposta ${atto ? `a ${ACTION_KIND_LABELS[atto.kind] ?? atto.kind}` : 'a un atto del gruppo'}`,
        `ricevuta il ${data(r.received_at)}`,
        `esito: ${r.classification ? PA_RESPONSE_CLASS_LABELS[r.classification] : 'non classificato'}`,
      ]
      // Solo `reason_anon`: `reason` è un estratto del testo grezzo e può
      // portarsi dietro nomi di funzionari e numeri di protocollo.
      if (r.reason_anon) parti.push(`motivo: ${r.reason_anon.slice(0, 300)}`)
      if (r.cites_art_5bis) parti.push('invoca un\'esclusione dell\'articolo 5-bis')
      righe.push(`- ${parti.join('; ')}`)
    }
  }

  righe.push('', `Scrivi ora la cronologia, al massimo ${MAX_TAPPE} tappe.`)

  return righe.join('\n')
}

// ---------------------------------------------------------------------------
// Normalizzazione dell'output
// ---------------------------------------------------------------------------

/**
 * Ripulisce il Markdown prima di salvarlo.
 *
 * I titoli vengono trasformati in testo in grassetto: la cronologia finisce
 * dentro una pagina che ha già il suo `<h1>`, e un `#` prodotto dal modello ne
 * creerebbe un secondo, rompendo la struttura per chi naviga con uno screen
 * reader. La pagina si difende anche da sola, ma il testo salvato deve essere
 * già a posto: viene riusato altrove senza che nessuno rilegga questo file.
 */
export function normalizzaCronologia(grezzo: string): string {
  const righe = grezzo
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((riga) => {
      const titolo = riga.match(/^\s{0,3}#{1,6}\s+(.*)$/)
      if (!titolo) return riga
      const testo = titolo[1]?.replace(/[*_]/g, '').trim() ?? ''
      return testo ? `**${testo}**` : ''
    })

  let testo = righe.join('\n').replace(/\n{3,}/g, '\n\n').trim()

  if (testo.length > MAX_CARATTERI_CRONOLOGIA) {
    // Taglio alla fine dell'ultima riga intera: troncare a metà frase
    // produrrebbe un fatto monco, che è peggio di un fatto in meno.
    const tagliato = testo.slice(0, MAX_CARATTERI_CRONOLOGIA)
    const ultimaRiga = tagliato.lastIndexOf('\n')
    testo = (ultimaRiga > 0 ? tagliato.slice(0, ultimaRiga) : tagliato).trim()
  }

  return testo
}
