import type { Metadata } from 'next'
import Link from 'next/link'
import { CalloutAvviso, CardIstituzionale, Numero } from '@voce/ui'

import { IntestazionePagina } from '@/components/admin/shell/IntestazionePagina'
import { richiediAdmin } from '@/lib/auth/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import { logger } from '@/lib/utils/logger'

/**
 * Riepilogo: cinque code di lavoro, cinque numeri, cinque collegamenti.
 *
 * Ogni numero è un collegamento alla sua coda. Quando una coda è vuota non
 * compare uno zero ma una frase: uno zero non distingue «hai finito» da «la
 * query è andata storta», e questa pagina è la prima cosa che si guarda al
 * mattino.
 *
 * Tutte le letture passano dalla sessione dell'amministratore, quindi dalla
 * RLS. Nessuna service role: qui non serve, e dove non serve non entra.
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Riepilogo',
  robots: { index: false, follow: false },
}

/** `null` significa «non lo sappiamo», ed è diverso da zero. */
type Conteggio = number | null

/**
 * Inizio della finestra osservata.
 *
 * Fuori dal componente di proposito: leggere l'orologio non è un'operazione
 * pura, e React lo considera un errore dentro il corpo di un componente.
 */
function inizioFinestra(giorni: number): string {
  return new Date(Date.now() - giorni * 24 * 60 * 60 * 1000).toISOString()
}

interface Coda {
  titolo: string
  href: string
  valore: Conteggio
  /** Cosa dice il numero quando è maggiore di zero. */
  unita: string
  /** Cosa si legge quando non c'è niente da fare. */
  vuota: string
}

export default async function RiepilogoPage() {
  const admin = await richiediAdmin()
  const sb = await createServerSupabase()
  const log = logger.child({ job: 'admin.riepilogo' })

  /** Conta le righe senza scaricarle: `head` non trasferisce alcun dato. */
  async function conta(
    etichetta: string,
    query: PromiseLike<{ count: number | null; error: unknown }>,
  ): Promise<Conteggio> {
    const { count, error } = await query
    if (error) {
      log.error('admin.conteggio_fallito', { error, coda: etichetta })
      return null
    }
    return count ?? 0
  }

  // Sette giorni: abbastanza per vedere un canale rotto, abbastanza poco da non
  // trascinarsi dietro il fallimento di un mese fa.
  const settimana = inizioFinestra(7)

  const [daModerare, gruppiDaRivedere, attiInBozza, risposteDaConfermare, notificheFallite] =
    await Promise.all([
      conta(
        'segnalazioni',
        sb
          .from('reports')
          .select('id', { count: 'exact', head: true })
          .or('status.eq.quarantena,moderation_flagged.is.true')
          .is('moderation_reviewed_by', null),
      ),
      conta(
        'gruppi',
        sb
          .from('admin_clusters_overview')
          .select('id', { count: 'exact', head: true })
          .eq('review_flag', true),
      ),
      conta(
        'atti',
        sb
          .from('admin_actions_queue')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'bozza')
          .is('reviewed_by', null),
      ),
      conta(
        'risposte',
        sb
          .from('action_responses')
          .select('id', { count: 'exact', head: true })
          .is('confirmed_by', null),
      ),
      // Le notifiche non si contano riga per riga: l'unica lettura concessa al
      // pannello è la vista aggregata, e qui se ne somma la colonna.
      (async (): Promise<Conteggio> => {
        const { data, error } = await sb
          .from('admin_notifications_health')
          .select('fallite')
          .gte('ora', settimana)

        if (error) {
          log.error('admin.conteggio_fallito', { error, coda: 'notifiche' })
          return null
        }

        return (data ?? []).reduce((somma, riga) => somma + (riga.fallite ?? 0), 0)
      })(),
    ])

  const code: Coda[] = [
    {
      titolo: 'Segnalazioni in quarantena',
      href: '/admin/segnalazioni',
      valore: daModerare,
      unita: 'da rivedere',
      vuota: 'Nessuna segnalazione in attesa di una decisione.',
    },
    {
      titolo: 'Gruppi da rivedere',
      href: '/admin/gruppi',
      valore: gruppiDaRivedere,
      unita: 'segnalati',
      vuota: 'Nessun gruppo sospettato di coordinamento.',
    },
    {
      titolo: 'Atti in bozza',
      href: '/admin/atti',
      valore: attiInBozza,
      unita: 'senza revisione',
      vuota: 'Nessuna bozza in attesa della tua firma.',
    },
    {
      titolo: 'Risposte da confermare',
      href: '/admin/risposte',
      valore: risposteDaConfermare,
      unita: 'da leggere',
      vuota: 'Nessuna risposta in attesa di conferma.',
    },
    {
      titolo: 'Avvisi non consegnati',
      href: '/admin/notifiche',
      valore: notificheFallite,
      unita: 'negli ultimi sette giorni',
      vuota: 'Tutti gli avvisi degli ultimi sette giorni sono partiti.',
    },
  ]

  const qualcosaNonHaRisposto = code.some((coda) => coda.valore === null)

  return (
    <>
      {/* Il titolo dice dove sei, non chi sei: il saluto sta sotto. Un `<h1>`
          che cambia con il nome di chi legge rende la pagina irriconoscibile
          a chi la naviga con uno screen reader. */}
      <IntestazionePagina
        titolo="Riepilogo"
        descrizione={`Buon lavoro, ${admin.fullName.split(' ')[0]}. Queste sono le code che aspettano una persona.`}
      />

      {qualcosaNonHaRisposto && (
        <CalloutAvviso tono="attenzione" titolo="Qualche numero manca" className="mb-6">
          Una lettura non è riuscita. Ricarica fra poco: il dato mancante è
          scritto «non disponibile», non zero.
        </CalloutAvviso>
      )}

      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {code.map((coda) => (
          <CardIstituzionale as="li" key={coda.href}>
            <h2 className="text-h4">
              <Link href={coda.href} className="hover:text-primary-700">
                {coda.titolo}
              </Link>
            </h2>

            {coda.valore === null ? (
              <p className="mt-4 text-body text-ink-muted">
                Non disponibile: la lettura non è riuscita.
              </p>
            ) : coda.valore === 0 ? (
              <p className="mt-4 text-body text-ink-muted">{coda.vuota}</p>
            ) : (
              <Numero className="mt-4" valore={coda.valore} etichetta={coda.unita} />
            )}

            <Link
              href={coda.href}
              className="mt-4 inline-flex min-h-11 items-center text-body font-semibold text-primary-600 underline underline-offset-4"
            >
              Apri {coda.titolo.toLowerCase()}
            </Link>
          </CardIstituzionale>
        ))}
      </ul>

      <CardIstituzionale className="mt-8">
        <h2 className="text-h4">Cosa non trovi qui</h2>
        <p className="mt-2 text-body text-ink-muted">
          Il pannello non mostra chi ha scritto una segnalazione, né il testo di
          quelle che non sono in moderazione. Non è una dimenticanza: chi
          amministra VOCE non deve poter sapere chi ha detto cosa.
        </p>
      </CardIstituzionale>
    </>
  )
}
