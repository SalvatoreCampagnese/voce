'use server'

/**
 * Le due decisioni possibili sulla coda di moderazione (PLAN2 §1.3).
 *
 * NIENTE CANCELLAZIONE. La quarantena non distrugge: mette da parte. Un falso
 * positivo su dialetto o su turpiloquio non offensivo — «'sta schifezza di
 * strada» — deve poter tornare indietro, e il racconto di un cittadino non
 * sparisce perché un classificatore si è insospettito.
 *
 * OGNI DECISIONE È FIRMATA. `moderation_reviewed_by` prende nome e cognome di
 * chi decide, e la policy RLS lo impone: una segnalazione esce dalla moderazione
 * solo se la riga risultante porta quella firma. Una decisione senza
 * responsabile non è una decisione.
 *
 * Le scritture passano dalla sessione dell'amministratore, quindi dalla RLS.
 * La policy `admin_reports_moderation_update` valuta la clausola USING sulla
 * riga PRIMA della modifica: nessuno può mettere in quarantena una segnalazione
 * sana per poi avere il diritto di leggerla.
 *
 * LA DECISIONE TORNA A CHI HA SCRITTO.
 * Il bot ha detto al cittadino: «la leggerà una persona». Qui la persona legge
 * e decide, e per un po' finiva tutto lì — nessun avviso, nessuna traccia in
 * `notifications`. Chi si era visto fermare la segnalazione restava in silenzio
 * per sempre, dopo una promessa mantenuta che nessuno veniva a sapere. Adesso
 * **entrambi** i rami accodano l'avviso: anche la conferma della quarantena,
 * che è la più scomoda da mandare e la più importante da non tacere.
 */

import { redirect } from 'next/navigation'
import { z } from 'zod'

import { richiediAdmin } from '@/lib/auth/admin'
import { accodaNotifica, type TipoNotifica } from '@/lib/notifications'
import { createServerSupabase } from '@/lib/supabase/server'
import { logger } from '@/lib/utils/logger'

const SchemaDecisione = z.object({
  id: z.uuid(),
  // Il filtro da cui arriva il modulo, per tornare dove si stava lavorando.
  stato: z.enum(['da-rivedere', 'riviste']).catch('da-rivedere'),
})

/** Riporta in circolo una segnalazione: il triage rigira e la rimette in gioco. */
export async function riammettiSegnalazione(formData: FormData): Promise<void> {
  await decidi(formData, 'riammetti')
}

/** Conferma la quarantena: resta fuori, con la revisione tracciata. */
export async function confermaQuarantena(formData: FormData): Promise<void> {
  await decidi(formData, 'conferma')
}

type Decisione = 'riammetti' | 'conferma'

async function decidi(formData: FormData, decisione: Decisione): Promise<void> {
  const admin = await richiediAdmin()

  const analisi = SchemaDecisione.safeParse({
    id: String(formData.get('id') ?? ''),
    stato: String(formData.get('stato') ?? 'da-rivedere'),
  })

  if (!analisi.success) {
    logger.warn('admin.moderazione.modulo_non_valido', { decisione })
    redirect('/admin/segnalazioni?esito=errore')
  }

  const { id, stato } = analisi.data
  const sb = await createServerSupabase()
  const adesso = new Date().toISOString()

  const modifiche =
    decisione === 'riammetti'
      ? {
          // 'nuovo' e non 'triaged': è lo stato che il cron di recupero
          // ripesca, e il triage rifà embedding, anonimizzazione e
          // raggruppamento. La colonna `previous_cluster_id`, scritta dal
          // trigger al momento della quarantena, riporta la segnalazione nel
          // gruppo da cui era stata staccata.
          status: 'nuovo' as const,
          moderation_flagged: false,
          moderation_reviewed_by: admin.fullName,
          moderation_reviewed_at: adesso,
        }
      : {
          status: 'quarantena' as const,
          moderation_flagged: true,
          moderation_reviewed_by: admin.fullName,
          moderation_reviewed_at: adesso,
        }

  // `.select()` non è un vezzo: senza, un update che la RLS lascia a zero righe
  // torna con `error` nullo e la pagina direbbe «riammessa» a fronte di niente.
  // Peggio: manderemmo al cittadino l'avviso di una decisione mai applicata.
  // La riga risultante resta leggibile perché porta la firma della revisione
  // (`moderation_reviewed_by`), che è proprio ciò che la policy richiede.
  const { data: aggiornata, error } = await sb
    .from('reports')
    .update(modifiche)
    .eq('id', id)
    .select('citizen_id')
    .maybeSingle()

  if (error) {
    logger.error('admin.moderazione.decisione_non_salvata', {
      error,
      report_id: id,
      decisione,
    })
    redirect(`/admin/segnalazioni?stato=${stato}&esito=errore`)
  }

  if (!aggiornata) {
    logger.error('admin.moderazione.decisione_senza_effetto', { report_id: id, decisione })
    redirect(`/admin/segnalazioni?stato=${stato}&esito=errore`)
  }

  logger.info('admin.moderazione.decisione', { report_id: id, decisione })

  await avvisaCittadino(id, aggiornata.citizen_id, decisione)

  const esito = decisione === 'riammetti' ? 'riammessa' : 'confermata'
  redirect(`/admin/segnalazioni?stato=${stato}&esito=${esito}`)
}

/**
 * Accoda l'avviso dell'esito. Non lancia e non blocca la decisione: la
 * moderazione è già salvata, e un avviso non partito non deve far sembrare
 * fallita una revisione riuscita. Se qualcosa non va, si logga.
 *
 * LA CHIAVE DI DEDUPLICA. `<tipo>:<report_id>`: deterministica, quindi un
 * doppio invio del modulo — due clic, un ritentativo del browser — produce un
 * solo messaggio. Il prezzo è che la stessa decisione presa due volte sulla
 * stessa segnalazione avvisa una volta sola, ed è quello che vogliamo: la
 * seconda volta non porta al cittadino nessuna notizia nuova. Le due decisioni
 * hanno chiavi diverse, quindi una segnalazione riammessa, di nuovo fermata e
 * poi confermata riceve entrambi gli avvisi.
 */
async function avvisaCittadino(
  reportId: string,
  citizenId: string | null,
  decisione: Decisione,
): Promise<void> {
  if (!citizenId) {
    // Succede per le segnalazioni sintetiche o per una riga rimasta orfana:
    // non è un guasto, ma va contato, altrimenti non sapremmo mai quante
    // decisioni non raggiungono nessuno.
    logger.warn('admin.moderazione.avviso_senza_destinatario', { report_id: reportId, decisione })
    return
  }

  const tipo: TipoNotifica =
    decisione === 'riammetti' ? 'moderazione_riammessa' : 'moderazione_confermata'

  const accodato = await accodaNotifica({
    citizenId,
    tipo,
    reportId,
    dedupeKey: `${tipo}:${reportId}`,
  })

  // `accodaNotifica` non lancia mai e logga già il proprio motivo (cittadino
  // sintetico, senza recapito, chiave già presente). Qui si registra soltanto
  // che l'esito di questa decisione non è finito in coda: è l'unico posto da
  // cui si può capire che una revisione è rimasta muta.
  if (!accodato) {
    logger.warn('admin.moderazione.avviso_non_accodato', { report_id: reportId, tipo })
    return
  }

  logger.info('admin.moderazione.avviso_accodato', { report_id: reportId, tipo })
}
