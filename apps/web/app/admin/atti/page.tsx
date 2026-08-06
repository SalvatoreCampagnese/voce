import Link from 'next/link'
import type { Metadata } from 'next'
import { CalloutAvviso } from '@voce/ui'
import {
  ACTION_STATUS_LABELS,
  type ActionStatus,
  type AdminActionQueueItem,
} from '@voce/db'

import { IntestazionePagina } from '@/components/admin/shell/IntestazionePagina'
import { RiquadroVuoto } from '@/components/admin/shell/RiquadroVuoto'
import { EsitoAzione } from '@/components/admin/atti/EsitoAzione'
import { TabellaAtti } from '@/components/admin/atti/TabellaAtti'
import { richiediAdmin } from '@/lib/auth/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import { logger } from '@/lib/utils/logger'

/**
 * La coda degli atti.
 *
 * È il punto in cui una persona si assume la responsabilità di un testo scritto
 * da una macchina. Tutto quello che si può fare da qui parte da un modulo
 * premuto a mano: nessuna riga di questo ramo porta un atto avanti da sola.
 *
 * `force-dynamic` non è prudenza generica. Una coda di lavoro servita dalla
 * cache mostra a chi revisiona un atto già revisionato da un collega dieci
 * minuti fa, e due firme sullo stesso testo sono due persone che credono
 * entrambe di averlo controllato.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Atti',
  robots: { index: false, follow: false },
}

const STATI: ActionStatus[] = [
  'bozza',
  'in_firma',
  'inviata',
  'risposta_ricevuta',
  'archiviata',
]

function statoValido(valore: string | string[] | undefined): ActionStatus | null {
  const primo = Array.isArray(valore) ? valore[0] : valore
  return STATI.includes(primo as ActionStatus) ? (primo as ActionStatus) : null
}

export default async function AttiPage({ searchParams }: PageProps<'/admin/atti'>) {
  await richiediAdmin()
  const parametri = await searchParams
  const filtro = statoValido(parametri.stato)

  const sb = await createServerSupabase()

  let query = sb
    .from('admin_actions_queue')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  if (filtro) query = query.eq('status', filtro)

  const { data, error } = await query

  if (error) {
    logger.error('admin.atti.lettura_fallita', {
      codice: error.code,
      messaggio: error.message,
    })
  }

  const atti = (data ?? []) as AdminActionQueueItem[]
  const daRevisionare = atti.filter((atto) => !atto.reviewed_by).length

  return (
    <>
      <IntestazionePagina
        titolo="Atti"
        descrizione="Qui si decide cosa esce a nome dei cittadini. Nessun atto parte da solo: ogni passaggio lo fai tu."
        percorso={[{ etichetta: 'Atti' }]}
      />

      <EsitoAzione esito={parametri.esito} errore={parametri.errore} />

      {error && (
        <CalloutAvviso tono="errore" titolo="Elenco non disponibile" className="mb-6">
          Non siamo riusciti a leggere gli atti. Ricarica la pagina fra qualche
          minuto.
        </CalloutAvviso>
      )}

      {/* Filtri come collegamenti e non come menu a tendina: funzionano senza
          JavaScript, restano nella cronologia del browser e si possono
          mandare a un collega. */}
      <nav aria-label="Filtra per stato" className="mb-6">
        <ul className="flex flex-wrap gap-2">
          <li>
            <Link
              href="/admin/atti"
              aria-current={filtro ? undefined : 'page'}
              className={`inline-flex min-h-11 items-center rounded-pill border px-4 text-body font-semibold ${
                filtro
                  ? 'border-border-control text-ink'
                  : 'border-primary-600 bg-primary-50 text-primary-700'
              }`}
            >
              Tutti
            </Link>
          </li>
          {STATI.map((stato) => (
            <li key={stato}>
              <Link
                href={`/admin/atti?stato=${stato}`}
                aria-current={filtro === stato ? 'page' : undefined}
                className={`inline-flex min-h-11 items-center rounded-pill border px-4 text-body font-semibold ${
                  filtro === stato
                    ? 'border-primary-600 bg-primary-50 text-primary-700'
                    : 'border-border-control text-ink'
                }`}
              >
                {ACTION_STATUS_LABELS[stato]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {atti.length === 0 ? (
        <RiquadroVuoto titolo="Nessun atto in questo elenco">
          <p>
            Gli atti compaiono qui quando un gruppo raggiunge la soglia di
            cittadini e il dossier viene preparato.
          </p>
        </RiquadroVuoto>
      ) : (
        <>
          <p className="mb-4 text-body">
            {atti.length} atti in elenco, {daRevisionare} ancora senza revisione.
          </p>
          <TabellaAtti atti={atti} />
        </>
      )}

      <h2 className="mt-12 text-h3">Come funziona la revisione</h2>
      <ul className="mt-3 max-w-3xl list-disc space-y-2 pl-5 text-small text-ink-muted">
        <li>
          Un atto in bozza non è pubblico. Il testo compare online solo quando
          qualcuno lo revisiona.
        </li>
        <li>
          Chi revisiona lascia il proprio nome accanto all&apos;atto. È una firma,
          non un&apos;etichetta.
        </li>
        <li>
          Il database rifiuta l&apos;invio di un atto non revisionato. Non esiste
          un percorso che lo aggiri.
        </li>
        <li>
          Gli atti marcati come dati di prova non vanno revisionati né inviati.
        </li>
      </ul>
    </>
  )
}
