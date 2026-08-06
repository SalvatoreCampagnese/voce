import { NextResponse, type NextRequest } from 'next/server'

import { assertCronSecret, isUnauthorizedError } from '@/lib/security/internal'
import { accodaNotifica } from '@/lib/notifications'
// SCADENZA_AVVISO_META e SCADENZA_GIORNI_SEGUITO non hanno una variabile
// d'ambiente e non compaiono in `getSoglie()`: si leggono da constants.ts,
// che per loro è la sorgente unica. Le soglie che invece hanno un override
// (lotto e budget di tempo del cron) continuano a passare da `getSoglie()`.
import { SCADENZA_AVVISO_META, SCADENZA_GIORNI_SEGUITO } from '@/lib/config/constants'
import { getSoglie } from '@/lib/config/thresholds'
import { generaAttoDiSeguito } from '@/lib/scadenze/seguito'
import { calcolaScadenza, istanteMetaTermine } from '@/lib/scadenze/termini'
import { createServiceClient } from '@/lib/supabase/service'
import { logger } from '@/lib/utils/logger'

export const runtime = 'nodejs'
// Next pretende un letterale statico: non si può importare la costante.
export const maxDuration = 60

/**
 * Quanti giorni dopo la scadenza un atto resta sotto osservazione.
 *
 * Passato questo margine non c'è più niente da fare: gli avvisi sono partiti e
 * l'atto di seguito è stato preparato. Serve a tenere corta la lista che il job
 * scandisce ogni mattina, perché gli atti scaduti si accumulano per sempre
 * mentre quelli che aspettano qualcosa sono pochi.
 */
const GIORNI_FINESTRA = 30

const MS_IN_UN_GIORNO = 24 * 60 * 60 * 1000

/**
 * Lo scadenzario normativo (PLAN2 §3.1).
 *
 * Ogni mattina guarda gli atti partiti e conta i giorni che nessuno contava:
 * avvisa i cittadini a metà termine, alla scadenza e quando la scadenza è
 * passata, e in quest'ultimo caso prepara la bozza dell'atto successivo.
 *
 * «Un accesso civico ignorato resta ignorato per sempre»: questo job è la
 * risposta a quella frase. Non spedisce niente e non porta nessun atto a
 * `inviata` — prepara, e avvisa le persone che avevano segnalato.
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
  const inizio = Date.now()
  const log = logger.child({ job: 'scadenze' })

  const esito = {
    scadenze_calcolate: 0,
    atti_esaminati: 0,
    avvisi_meta: 0,
    avvisi_scadenza: 0,
    avvisi_superata: 0,
    seguiti_generati: 0,
  }

  try {
    esito.scadenze_calcolate = await riempiScadenzeMancanti(sb, soglie.cronBatchSize, log)

    const adesso = new Date()
    const finestra = new Date(adesso.getTime() - GIORNI_FINESTRA * MS_IN_UN_GIORNO)

    const { data: atti, error } = await sb
      .from('actions')
      .select('id, cluster_id, kind, title, submitted_at, deadline_at, deadline_days, deadline_basis')
      .eq('status', 'inviata')
      .eq('is_synthetic', false)
      .not('deadline_at', 'is', null)
      .not('submitted_at', 'is', null)
      .gte('deadline_at', finestra.toISOString())
      .order('deadline_at', { ascending: true })
      .limit(soglie.cronBatchSize)

    if (error) throw new Error(error.message)

    // I cittadini di un gruppo si leggono una volta sola: due atti dello stesso
    // gruppo scadono spesso nello stesso giorno.
    const destinatariPerGruppo = new Map<string, string[]>()

    for (const atto of atti ?? []) {
      if (Date.now() - inizio > soglie.cronTimeBudgetMs) {
        log.warn('cron.scadenze.budget_esaurito', { esaminati: esito.atti_esaminati })
        break
      }

      esito.atti_esaminati += 1

      // Il filtro `not is null` della query lo garantisce già; il controllo
      // esplicito serve al compilatore e a chi legge.
      if (!atto.deadline_at || !atto.submitted_at) continue

      const scadenza = new Date(atto.deadline_at)
      const meta = istanteMetaTermine(atto.submitted_at, atto.deadline_at, SCADENZA_AVVISO_META)
      const seguito = new Date(scadenza.getTime() + SCADENZA_GIORNI_SEGUITO * MS_IN_UN_GIORNO)

      let destinatari = destinatariPerGruppo.get(atto.cluster_id)
      if (!destinatari) {
        destinatari = await cittadiniDelGruppo(sb, atto.cluster_id, log)
        destinatariPerGruppo.set(atto.cluster_id, destinatari)
      }

      if (destinatari.length === 0) continue

      /**
       * Contesto della notifica: solo identificatori tecnici e testi già
       * pubblici, come impone il vincolo `notifications_payload_senza_
       * identificatori`. Il titolo dell'atto è prefissato `atto_` per non
       * confondersi con il `titolo` del gruppo, che il modulo delle notifiche
       * risolve da sé al momento dell'invio.
       */
      const contesto = {
        atto_kind: atto.kind,
        atto_titolo: atto.title,
        scadenza: scadenza.toISOString().slice(0, 10),
        giorni_termine: atto.deadline_days,
        base_termine: atto.deadline_basis,
      }

      // L'ordine è quello del tempo, e le tre notifiche non si escludono: un
      // atto ripescato dopo giorni di fermo macchina deve mandarle tutte, e la
      // deduplica garantisce che chi le aveva già ricevute non le riceva due
      // volte.
      if (meta && adesso >= meta) {
        esito.avvisi_meta += await avvisa(
          destinatari,
          'scadenza_meta',
          atto.id,
          atto.cluster_id,
          contesto,
          log,
        )
      }

      if (adesso >= scadenza) {
        esito.avvisi_scadenza += await avvisa(
          destinatari,
          'scadenza_raggiunta',
          atto.id,
          atto.cluster_id,
          contesto,
          log,
        )
      }

      if (adesso >= seguito) {
        esito.avvisi_superata += await avvisa(
          destinatari,
          'scadenza_superata',
          atto.id,
          atto.cluster_id,
          contesto,
          log,
        )

        // La macchina prepara, la persona firma: nasce `bozza` e nessuno la
        // spedisce da solo.
        const risultato = await generaAttoDiSeguito(atto.id)
        if (risultato.generato) esito.seguiti_generati += 1
      }
    }

    log.info('cron.scadenze.completato', { ...esito })
    return NextResponse.json({ ok: true, ...esito })
  } catch (errore) {
    log.error('cron.scadenze.fallito', {
      messaggio: errore instanceof Error ? errore.message : String(errore),
      ...esito,
    })
    return NextResponse.json({ ok: false, errore: 'esecuzione fallita' }, { status: 500 })
  }
}

/**
 * Rete per gli atti partiti senza scadenza.
 *
 * `deadline_at` la scrive il pannello di amministrazione quando una persona
 * manda l'atto. Se quel passaggio è stato saltato — un atto importato, un
 * aggiornamento fatto a mano in tabella, un bug di ieri — l'atto non scadrebbe
 * mai e il cittadino resterebbe ad aspettare in silenzio, che è esattamente il
 * difetto che PLAN2 §3.1 esiste per chiudere.
 */
async function riempiScadenzeMancanti(
  sb: ReturnType<typeof createServiceClient>,
  lotto: number,
  log: ReturnType<typeof logger.child>,
): Promise<number> {
  const { data: senzaScadenza, error } = await sb
    .from('actions')
    .select('id, kind, submitted_at')
    .eq('status', 'inviata')
    .eq('is_synthetic', false)
    .is('deadline_at', null)
    .not('submitted_at', 'is', null)
    .limit(lotto)

  if (error) {
    log.error('cron.scadenze.backfill_non_letto', { messaggio: error.message })
    return 0
  }

  let riempite = 0

  for (const atto of senzaScadenza ?? []) {
    if (!atto.submitted_at) continue

    const scadenza = calcolaScadenza(atto.kind, atto.submitted_at)
    if (!scadenza) continue // niente termine di legge per quel tipo di atto

    const { error: erroreUpdate } = await sb
      .from('actions')
      .update({
        deadline_at: scadenza.deadlineAt,
        deadline_days: scadenza.deadlineDays,
        deadline_basis: scadenza.deadlineBasis,
      })
      .eq('id', atto.id)
      .is('deadline_at', null)

    if (erroreUpdate) {
      log.error('cron.scadenze.backfill_fallito', {
        action_id: atto.id,
        messaggio: erroreUpdate.message,
      })
      continue
    }

    riempite += 1
  }

  return riempite
}

/**
 * I cittadini a cui l'atto appartiene: quelli che hanno segnalato.
 *
 * Stessi filtri delle citazioni negli atti. Chi è finito in quarantena non
 * riceve l'avviso perché la sua segnalazione non è più dentro il gruppo: gli
 * scriveremmo di un atto che non lo riguarda.
 */
async function cittadiniDelGruppo(
  sb: ReturnType<typeof createServiceClient>,
  clusterId: string,
  log: ReturnType<typeof logger.child>,
): Promise<string[]> {
  const { data, error } = await sb
    .from('reports')
    .select('citizen_id')
    .eq('cluster_id', clusterId)
    .eq('is_synthetic', false)
    .eq('status', 'clustered')
    .eq('moderation_flagged', false)
    .not('citizen_id', 'is', null)
    .limit(1000)

  if (error) {
    log.error('cron.scadenze.destinatari_non_letti', {
      cluster_id: clusterId,
      messaggio: error.message,
    })
    return []
  }

  const distinti = new Set<string>()
  for (const riga of data ?? []) {
    if (riga.citizen_id) distinti.add(riga.citizen_id)
  }

  return [...distinti]
}

/**
 * Accoda un avviso a ogni cittadino del gruppo.
 *
 * La chiave di deduplica è deterministica — `tipo:atto:cittadino` — perché il
 * job gira ogni giorno sugli stessi atti: senza, chi ha segnalato riceverebbe
 * lo stesso avviso ogni mattina fino alla fine dei tempi, e si toglierebbe
 * dalle notifiche il secondo giorno.
 */
async function avvisa(
  destinatari: string[],
  tipo: 'scadenza_meta' | 'scadenza_raggiunta' | 'scadenza_superata',
  actionId: string,
  clusterId: string,
  payload: Record<string, unknown>,
  log: ReturnType<typeof logger.child>,
): Promise<number> {
  let accodate = 0

  for (const citizenId of destinatari) {
    try {
      const nuova = await accodaNotifica({
        citizenId,
        tipo,
        actionId,
        clusterId,
        dedupeKey: `${tipo}:${actionId}:${citizenId}`,
        payload,
      })
      if (nuova) accodate += 1
    } catch (errore) {
      // Una notifica persa non deve fermare le altre, ma non sparisce in
      // silenzio: senza questo log un cittadino resterebbe senza avviso e
      // nessuno saprebbe perché.
      log.error('cron.scadenze.notifica_non_accodata', {
        action_id: actionId,
        cluster_id: clusterId,
        tipo,
        messaggio: errore instanceof Error ? errore.message : String(errore),
      })
    }
  }

  return accodate
}
