import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { CalloutAvviso, CardIstituzionale } from '@voce/ui'
import {
  NOTIFICATION_CHANNEL_LABELS,
  NOTIFICATION_KIND_LABELS,
  type NotificationChannel,
  type NotificationKind,
} from '@voce/db'
import { z } from 'zod'

import { AzioneConConferma } from '@/components/admin/shell/AzioneConConferma'
import { IntestazionePagina } from '@/components/admin/shell/IntestazionePagina'
import { RiquadroVuoto } from '@/components/admin/shell/RiquadroVuoto'
import { CellaAdmin, TabellaAdmin } from '@/components/admin/shell/TabellaAdmin'
import { richiediAdmin } from '@/lib/auth/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logger } from '@/lib/utils/logger'

/**
 * Salute delle notifiche (PLAN2 §1.1).
 *
 * QUI NON C'È L'ELENCO DELLE NOTIFICHE, ED È UNA SCELTA.
 * Una riga di `notifications` porta accanto `citizen_id`, `report_id` e una
 * `dedupe_key` che ripete la coppia in chiaro. Bastava una lettura per
 * ricostruire la mappa «questo cittadino ha segnalato quel problema»: proprio
 * ciò che tutto il resto dello schema evita di rendere leggibile, e proprio
 * l'informazione che, nei quartieri in cui VOCE vuole lavorare, espone una
 * persona a una ritorsione. La policy che lo permetteva è stata tolta.
 *
 * Resta la vista aggregata `admin_notifications_health`: tipo, canale, ora,
 * conteggi. È sufficiente alla domanda vera — «stiamo mantenendo le promesse, e
 * su quale canale le stiamo rompendo?» — perché un canale mal configurato
 * produce una colonna di fallimenti tutti uguali, che è esattamente il segnale
 * che serve.
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Notifiche',
  robots: { index: false, follow: false },
}

/** Finestra osservata. Sette giorni bastano a vedere un canale rotto. */
const GIORNI = 7

const SchemaCanale = z.object({
  // Solo i canali che possono davvero partire. WhatsApp non è collegato: le sue
  // righe nascono già fallite per contare chi restiamo indietro, e rimetterle in
  // coda produrrebbe soltanto lo stesso fallimento un minuto dopo.
  canale: z.enum(['telegram', 'email']),
})

interface Riepilogo {
  totali: number
  inviate: number
  fallite: number
  tentativiMax: number
}

function vuoto(): Riepilogo {
  return { totali: 0, inviate: 0, fallite: 0, tentativiMax: 0 }
}

/**
 * Inizio della finestra osservata. Sta fuori dal componente perché leggere
 * l'orologio non è un'operazione pura, e dentro un componente React lo segnala.
 */
function inizioFinestra(giorni: number): string {
  return new Date(Date.now() - giorni * 24 * 60 * 60 * 1000).toISOString()
}

function inCoda(r: Riepilogo): number {
  // Né partite né fallite: stanno ancora aspettando il cron.
  return Math.max(r.totali - r.inviate - r.fallite, 0)
}

export default async function NotifichePage({ searchParams }: PageProps<'/admin/notifiche'>) {
  await richiediAdmin()

  /**
   * Rimette in coda gli avvisi falliti di un canale.
   *
   * QUESTO È L'UNICO PUNTO DEL PANNELLO CHE USA LA SERVICE ROLE, e il motivo è
   * preciso: l'amministratore non può leggere né scrivere le righe di
   * `notifications` — non esiste alcuna policy che gliele conceda, apposta — e
   * quindi una UPDATE dalla sua sessione toccherebbe zero righe. L'operazione
   * resta sicura perché agisce per categoria e non per riga: non legge, non
   * mostra e non restituisce alcun identificatore. `richiediAdmin()` viene
   * prima di qualunque cosa, dentro l'azione e non solo nella pagina: una
   * Server Action è un endpoint HTTP, e chiunque ne conosca l'indirizzo può
   * chiamarla senza passare da qui.
   */
  async function rimettiInCoda(formData: FormData): Promise<void> {
    'use server'

    const admin = await richiediAdmin()

    const analisi = SchemaCanale.safeParse({ canale: String(formData.get('canale') ?? '') })
    if (!analisi.success) {
      redirect('/admin/notifiche?esito=errore')
    }

    const canale = analisi.data.canale
    const servizio = createServiceClient()

    const { count, error: erroreCoda } = await servizio
      .from('notifications')
      .update(
        // I tentativi tornano a zero: senza, la riga resterebbe sopra il tetto
        // di tentativi e uscirebbe dalla coda un istante dopo esserci rientrata.
        { failed_at: null, last_error: null, attempts: 0 },
        { count: 'exact' },
      )
      .eq('channel', canale)
      .is('sent_at', null)
      .not('failed_at', 'is', null)

    if (erroreCoda) {
      logger.error('admin.notifiche.rimessa_in_coda_fallita', { error: erroreCoda, canale })
      redirect('/admin/notifiche?esito=errore')
    }

    logger.info('admin.notifiche.rimesse_in_coda', {
      canale,
      quante: count ?? 0,
      deciso_da: admin.id,
    })

    redirect(`/admin/notifiche?esito=rimesse&quante=${count ?? 0}`)
  }

  const parametri = await searchParams
  const esito = typeof parametri.esito === 'string' ? parametri.esito : null
  const quante = typeof parametri.quante === 'string' ? parametri.quante : '0'

  const sb = await createServerSupabase()
  const da = inizioFinestra(GIORNI)

  const { data, error } = await sb
    .from('admin_notifications_health')
    .select('kind, channel, ora, totali, inviate, fallite, tentativi_max')
    .gte('ora', da)
    .order('ora', { ascending: false })

  if (error) {
    logger.error('admin.notifiche.lettura_fallita', { error })
  }

  const righe = data ?? []

  const perCanale = new Map<NotificationChannel, Riepilogo>()
  const perTipo = new Map<NotificationKind, Riepilogo>()
  const totale = vuoto()

  for (const riga of righe) {
    const conteggi = {
      totali: riga.totali ?? 0,
      inviate: riga.inviate ?? 0,
      fallite: riga.fallite ?? 0,
      tentativiMax: riga.tentativi_max ?? 0,
    }

    const accumula = (dove: Riepilogo) => {
      dove.totali += conteggi.totali
      dove.inviate += conteggi.inviate
      dove.fallite += conteggi.fallite
      dove.tentativiMax = Math.max(dove.tentativiMax, conteggi.tentativiMax)
    }

    accumula(totale)

    if (riga.channel) {
      const corrente = perCanale.get(riga.channel) ?? vuoto()
      accumula(corrente)
      perCanale.set(riga.channel, corrente)
    }

    if (riga.kind) {
      const corrente = perTipo.get(riga.kind) ?? vuoto()
      accumula(corrente)
      perTipo.set(riga.kind, corrente)
    }
  }

  return (
    <>
      <IntestazionePagina
        percorso={[{ etichetta: 'Notifiche' }]}
        titolo="Notifiche ai cittadini"
        descrizione={`Quanti avvisi sono partiti negli ultimi ${GIORNI} giorni, e su quale canale si stanno rompendo.`}
      />

      {esito === 'rimesse' && (
        <CalloutAvviso tono="successo" titolo="Rimessi in coda" className="mb-6">
          {quante === '1'
            ? 'Un avviso tornerà a partire al prossimo giro.'
            : `${quante} avvisi torneranno a partire al prossimo giro.`}
        </CalloutAvviso>
      )}

      {esito === 'errore' && (
        <CalloutAvviso tono="errore" titolo="Non è andata" className="mb-6">
          Nessun avviso è stato rimesso in coda. Riprova fra poco.
        </CalloutAvviso>
      )}

      {error && (
        <CalloutAvviso tono="errore" titolo="Lettura non riuscita" className="mb-6">
          Non siamo riusciti a leggere i conteggi. Ricarica fra poco.
        </CalloutAvviso>
      )}

      <CalloutAvviso tono="info" titolo="Perché non c’è l’elenco" className="mb-8">
        Un elenco riga per riga direbbe quale cittadino ha segnalato quale
        problema. Non è un pezzo mancante: è una porta chiusa apposta. Per capire
        se le promesse vengono mantenute bastano i numeri qui sotto.
      </CalloutAvviso>

      {righe.length === 0 ? (
        <RiquadroVuoto titolo="Nessun avviso in questi giorni">
          <p>
            Non è partito né fallito niente. Se ti aspettavi degli avvisi,
            controlla che il lavoro periodico delle notifiche stia girando.
          </p>
        </RiquadroVuoto>
      ) : (
        <div className="flex flex-col gap-8">
          <TabellaAdmin
            didascalia={`Avviso per canale, ultimi ${GIORNI} giorni`}
            colonne={['Canale', 'Totali', 'Partiti', 'In coda', 'Falliti', 'Tentativi massimi']}
          >
            {[...perCanale.entries()].map(([canale, r]) => (
              <tr key={canale}>
                <CellaAdmin intestazione>{NOTIFICATION_CHANNEL_LABELS[canale]}</CellaAdmin>
                <CellaAdmin>{r.totali}</CellaAdmin>
                <CellaAdmin>{r.inviate}</CellaAdmin>
                <CellaAdmin>{inCoda(r)}</CellaAdmin>
                {/* Il numero, non solo il colore: chi non distingue i colori
                    deve leggere la stessa informazione (WCAG 1.4.1). */}
                <CellaAdmin className={r.fallite > 0 ? 'font-semibold text-danger' : undefined}>
                  {r.fallite}
                </CellaAdmin>
                <CellaAdmin>{r.tentativiMax}</CellaAdmin>
              </tr>
            ))}
            <tr>
              <CellaAdmin intestazione>Tutti i canali</CellaAdmin>
              <CellaAdmin>{totale.totali}</CellaAdmin>
              <CellaAdmin>{totale.inviate}</CellaAdmin>
              <CellaAdmin>{inCoda(totale)}</CellaAdmin>
              <CellaAdmin>{totale.fallite}</CellaAdmin>
              <CellaAdmin>{totale.tentativiMax}</CellaAdmin>
            </tr>
          </TabellaAdmin>

          <TabellaAdmin
            didascalia={`Avvisi per tipo, ultimi ${GIORNI} giorni`}
            colonne={['Tipo di avviso', 'Totali', 'Partiti', 'In coda', 'Falliti']}
          >
            {[...perTipo.entries()].map(([tipo, r]) => (
              <tr key={tipo}>
                <CellaAdmin intestazione>{NOTIFICATION_KIND_LABELS[tipo]}</CellaAdmin>
                <CellaAdmin>{r.totali}</CellaAdmin>
                <CellaAdmin>{r.inviate}</CellaAdmin>
                <CellaAdmin>{inCoda(r)}</CellaAdmin>
                <CellaAdmin className={r.fallite > 0 ? 'font-semibold text-danger' : undefined}>
                  {r.fallite}
                </CellaAdmin>
              </tr>
            ))}
          </TabellaAdmin>

          <CardIstituzionale>
            <h2 className="text-h4">Rimetti in coda quelli falliti</h2>
            <p className="mt-2 text-body text-ink-muted">
              Si agisce per canale, mai su un singolo avviso: per rimettere in
              coda una riga sola bisognerebbe prima poterla leggere, e nessuno
              qui deve poterlo fare.
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              {(['telegram', 'email'] as const).map((canale) => {
                const falliti = perCanale.get(canale)?.fallite ?? 0
                if (falliti === 0) return null

                return (
                  <AzioneConConferma
                    key={canale}
                    azione={rimettiInCoda}
                    campi={{ canale }}
                    etichetta={`Riprova i ${falliti} falliti su ${NOTIFICATION_CHANNEL_LABELS[canale]}`}
                    domanda="Gli avvisi tornano nella coda e il lavoro periodico li riprende. Chi li ha già ricevuti non li riceve due volte."
                    conferma="Sì, rimettili in coda"
                    variante="primary"
                  />
                )
              })}

              {(perCanale.get('telegram')?.fallite ?? 0) === 0 &&
                (perCanale.get('email')?.fallite ?? 0) === 0 && (
                  <p className="text-body text-ink-muted">
                    Niente da riprovare: su Telegram ed email non ci sono avvisi
                    falliti.
                  </p>
                )}
            </div>

            {(perCanale.get('whatsapp')?.fallite ?? 0) > 0 && (
              <p className="mt-4 text-small text-ink-muted">
                I {perCanale.get('whatsapp')?.fallite} avvisi falliti su WhatsApp
                non si riprovano: il canale non è collegato. Quel numero conta le
                persone che stiamo lasciando indietro.
              </p>
            )}
          </CardIstituzionale>
        </div>
      )}
    </>
  )
}
