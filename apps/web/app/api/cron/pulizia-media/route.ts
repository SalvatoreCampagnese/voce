import { NextResponse, type NextRequest } from 'next/server'

import { STORAGE_BUCKET_MEDIA } from '@/lib/config/constants'
import { getSoglie } from '@/lib/config/thresholds'
import { assertCronSecret, isUnauthorizedError } from '@/lib/security/internal'
import { createServiceClient } from '@/lib/supabase/service'
import { logger, serializeError } from '@/lib/utils/logger'

/**
 * La seconda metà del diritto all'oblio.
 *
 * `delete_citizen_account()` cancella le righe, ma SQL non raggiunge lo
 * storage: il file resta nel bucket. Per un vocale questo significa che la voce
 * di una persona — un dato biometrico — continua a esistere dopo che ha chiesto
 * di sparire. La migrazione accoda i percorsi in `storage_deletions`; questo job
 * è ciò che rende quella promessa vera invece che scritta.
 *
 * Finché nessuno svuota la coda, il diritto all'oblio è mantenuto a metà, e la
 * cosa peggiore è che nessuno se ne accorge. Per questo il job logga sempre
 * l'esito, anche quando non c'è niente da fare: un obbligo non adempiuto deve
 * essere visibile prima che qualcuno lo chieda.
 */

// Node.js: il client Supabase con service role e l'accesso allo storage non
// girano su edge, e non ci sarebbe alcun vantaggio.
export const runtime = 'nodejs'

// Letterale, come richiede Next.js per `maxDuration`. Il budget effettivo di
// lavoro sta in `getSoglie().cronTimeBudgetMs`, dieci secondi più basso.
export const maxDuration = 60

/**
 * Tentativi prima di lasciare una riga in coda senza più riprovarla.
 *
 * Serve a non trasformare un percorso malformato in un ciclo infinito che
 * consuma ogni giro del job e impedisce agli altri file di essere cancellati.
 * Una riga che arriva qui resta in coda con `attempts` al massimo e compare nel
 * conteggio dei bloccati: va guardata da una persona, non ritentata per sempre.
 */
const MAX_TENTATIVI = 5

/** Percorsi per singola chiamata a `remove()`. */
const PERCORSI_PER_CHIAMATA = 50

/** Oltre questi giorni in coda, la cancellazione è un obbligo scaduto. */
const GIORNI_DI_ALLARME = 7

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

  let rimossi = 0
  let falliti = 0

  try {
    const { data: coda, error } = await sb
      .from('storage_deletions')
      .select('id,bucket,path,attempts')
      .is('deleted_at', null)
      .lt('attempts', MAX_TENTATIVI)
      .order('requested_at', { ascending: true })
      .limit(soglie.cronBatchSize)

    if (error) throw error

    // Raggruppate per bucket: `remove()` lavora su un bucket alla volta. Oggi il
    // bucket è sempre quello dei media, ma la colonna esiste e ignorarla
    // significherebbe non cancellare mai i file di un bucket futuro.
    const perBucket = new Map<string, { id: string; path: string; attempts: number }[]>()
    for (const riga of coda ?? []) {
      if (riga.bucket !== STORAGE_BUCKET_MEDIA) {
        logger.warn('cron.pulizia_media.bucket_inatteso', { bucket: riga.bucket })
      }
      const gruppo = perBucket.get(riga.bucket) ?? []
      gruppo.push({ id: riga.id, path: riga.path, attempts: riga.attempts })
      perBucket.set(riga.bucket, gruppo)
    }

    let budgetEsaurito = false

    for (const [bucket, righe] of perBucket) {
      for (let i = 0; i < righe.length; i += PERCORSI_PER_CHIAMATA) {
        if (Date.now() - inizio > soglie.cronTimeBudgetMs) {
          budgetEsaurito = true
          break
        }

        const lotto = righe.slice(i, i + PERCORSI_PER_CHIAMATA)
        const percorsi = lotto.map((riga) => riga.path)

        const { error: erroreStorage } = await sb.storage.from(bucket).remove(percorsi)

        if (erroreStorage) {
          // Errore vero (permessi, rete, bucket assente): le righe restano in
          // coda e il contatore dei tentativi cresce, così un percorso rotto
          // smette di bloccare il giro dopo MAX_TENTATIVI.
          falliti += lotto.length
          const messaggio = erroreStorage.message.slice(0, 300)

          for (const riga of lotto) {
            const { error: erroreAggiornamento } = await sb
              .from('storage_deletions')
              .update({ attempts: riga.attempts + 1, last_error: messaggio })
              .eq('id', riga.id)

            if (erroreAggiornamento) {
              logger.error('cron.pulizia_media.tentativo_non_registrato', {
                bucket,
                ...serializeError(erroreAggiornamento),
              })
            }
          }

          logger.error('cron.pulizia_media.rimozione_fallita', {
            bucket,
            percorsi: lotto.length,
            ...serializeError(erroreStorage),
          })
          continue
        }

        // Nessun errore significa che quei percorsi non sono più nel bucket.
        // L'elenco restituito da `remove()` contiene solo i file che esistevano
        // davvero: un file già assente non compare, e non è un fallimento —
        // l'obiettivo era che non ci fosse, e non c'è. Va tolto dalla coda lo
        // stesso, altrimenti resterebbe lì a fingere un obbligo non adempiuto.
        const { error: erroreChiusura } = await sb
          .from('storage_deletions')
          .update({ deleted_at: new Date().toISOString(), last_error: null })
          .in(
            'id',
            lotto.map((riga) => riga.id),
          )

        if (erroreChiusura) {
          // I file sono spariti ma la coda non lo sa: il prossimo giro li
          // ritenta e li trova assenti. Nessun danno, ma va visto.
          falliti += lotto.length
          logger.error('cron.pulizia_media.coda_non_aggiornata', {
            bucket,
            percorsi: lotto.length,
            ...serializeError(erroreChiusura),
          })
          continue
        }

        rimossi += lotto.length
      }

      if (budgetEsaurito) break
    }

    // Fotografia della coda dopo il giro. Serve a rispondere a una domanda
    // precisa — «c'è qualcosa che doveva sparire e non è sparito?» — senza
    // dover interrogare il database a mano.
    const { count: inCoda } = await sb
      .from('storage_deletions')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)

    const { count: bloccati } = await sb
      .from('storage_deletions')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
      .gte('attempts', MAX_TENTATIVI)

    const limiteAllarme = new Date(
      Date.now() - GIORNI_DI_ALLARME * 24 * 60 * 60 * 1000,
    ).toISOString()

    const { count: scaduti } = await sb
      .from('storage_deletions')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
      .lt('requested_at', limiteAllarme)

    const esito = {
      rimossi,
      falliti,
      in_coda: inCoda ?? 0,
      bloccati: bloccati ?? 0,
      scaduti: scaduti ?? 0,
      budget_esaurito: budgetEsaurito,
    }

    if ((scaduti ?? 0) > 0 || (bloccati ?? 0) > 0) {
      // Livello error di proposito: su Vercel è il livello a cui si aggancia un
      // allarme, e un file che doveva sparire da una settimana non è un avviso.
      logger.error('cron.pulizia_media.obblighi_arretrati', esito)
    } else {
      logger.info('cron.pulizia_media.completato', esito)
    }

    return NextResponse.json({ ok: true, ...esito })
  } catch (errore) {
    logger.error('cron.pulizia_media.fallito', {
      rimossi,
      falliti,
      ...serializeError(errore),
    })
    return NextResponse.json(
      { ok: false, errore: 'esecuzione fallita' },
      { status: 500 },
    )
  }
}
