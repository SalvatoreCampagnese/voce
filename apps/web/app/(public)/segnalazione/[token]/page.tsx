import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import {
  Breadcrumb,
  CalloutAvviso,
  CardIstituzionale,
  Numero,
  TagStato,
  bottoneVarianti,
} from '@voce/ui'
import { CATEGORY_LABELS, type ClusterStatus } from '@voce/db'
import { createAnonSupabase } from '@/lib/supabase/anon'
import { logger, serializeError } from '@/lib/utils/logger'

// Pagina personale: mai in cache condivisa, mai negli indici dei motori.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'La tua segnalazione',
  robots: { index: false, follow: false },
}

interface StatoSegnalazione {
  status: string
  category: string | null
  urgency: number | null
  citta: string | null
  quartiere: string | null
  anon_text: string | null
  created_at: string
  cluster_id: string | null
  cluster_title: string | null
  cluster_status: string | null
  cluster_citizens: number | null
  cluster_reports: number | null
  cluster_is_public: boolean | null
}

async function leggiSegnalazione(token: string): Promise<StatoSegnalazione | null> {
  try {
    const sb = createAnonSupabase()
    const { data, error } = await sb.rpc('get_report_status', { token })
    if (error) throw error
    const righe = (data ?? []) as StatoSegnalazione[]
    return righe[0] ?? null
  } catch (errore) {
    logger.error('segnalazione.lettura_fallita', serializeError(errore))
    return null
  }
}

/** Che cosa sta succedendo, detto senza gergo. */
function spiegazione(s: StatoSegnalazione): { tono: 'info' | 'successo' | 'attenzione'; titolo: string; testo: string } {
  if (s.cluster_id && s.cluster_is_public) {
    return {
      tono: 'successo',
      titolo: 'Non sei da solo',
      testo:
        'La tua segnalazione fa parte di un gruppo: altre persone della tua zona ' +
        'hanno raccontato lo stesso problema. Da qui può nascere un atto.',
    }
  }
  if (s.cluster_id) {
    return {
      tono: 'info',
      titolo: 'Hai trovato altri come te',
      testo:
        'La tua segnalazione è stata unita ad altre simili. Il gruppo diventa ' +
        'pubblico quando almeno tre persone diverse raccontano lo stesso problema.',
    }
  }
  if (s.status === 'nuovo') {
    return {
      tono: 'info',
      titolo: 'L’abbiamo ricevuta',
      testo: 'La stiamo leggendo. Fra poco la confronteremo con le altre della tua zona.',
    }
  }
  // Archiviata: dirle «la stiamo confrontando» sarebbe falso, ed è la bugia
  // più facile da dire perché nessuno se ne accorgerebbe.
  if (s.status === 'archiviato') {
    return {
      tono: 'attenzione',
      titolo: 'Ci servono più dettagli',
      testo:
        'Così com’è non riusciamo a confrontarla con le altre: mancano il cosa, ' +
        'il dove o il quando. Riscrivila sul canale da cui l’hai mandata e la ' +
        'sostituiamo a questa.',
    }
  }
  return {
    tono: 'info',
    titolo: 'La stiamo confrontando',
    testo:
      'Per ora nessun altro ha segnalato lo stesso problema nella tua zona. ' +
      'Continuiamo a controllare a ogni nuova segnalazione: ti avvisiamo appena ' +
      'si forma un gruppo.',
  }
}

export default async function SegnalazionePage({ params }: PageProps<'/segnalazione/[token]'>) {
  const { token } = await params
  const segnalazione = await leggiSegnalazione(token)

  // Token inesistente: 404 identico a una pagina qualsiasi, senza dire se il
  // token è sbagliato o scaduto. Non c'è niente da far dedurre a chi prova.
  if (!segnalazione) notFound()

  const s = segnalazione
  const messaggio = spiegazione(s)
  const data = new Date(s.created_at).toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <>
      <Breadcrumb
        voci={[{ etichetta: 'Home', href: '/' }, { etichetta: 'La tua segnalazione' }]}
      />

      <div className="max-w-2xl">
        <h1 className="text-h1">La tua segnalazione</h1>
        <p className="mt-2 text-small text-ink-muted">
          Inviata il {data}
          {s.citta ? ` · ${s.citta}` : ''}
          {s.quartiere ? ` · ${s.quartiere}` : ''}
        </p>

        <CalloutAvviso tono={messaggio.tono} titolo={messaggio.titolo} className="mt-6">
          {messaggio.testo}
        </CalloutAvviso>

        {s.anon_text && (
          <CardIstituzionale className="mt-6">
            <h2 className="text-h4">Come l’abbiamo capita</h2>
            <p className="mt-3 text-body text-ink-muted">{s.anon_text}</p>
            {s.category && (
              <p className="mt-4 text-small text-ink">
                Categoria: <strong>{CATEGORY_LABELS[s.category] ?? s.category}</strong>
              </p>
            )}
            <p className="mt-4 text-caption text-ink-subtle">
              Questa è la versione senza nomi né indirizzi precisi: è l’unica che
              può comparire nelle pagine pubbliche.
            </p>
          </CardIstituzionale>
        )}

        {s.cluster_id && (
          <CardIstituzionale className="mt-6">
            <div className="flex flex-wrap items-center gap-2">
              <TagStato stato={(s.cluster_status ?? 'emergente') as ClusterStatus} />
              <span className="text-caption text-ink-muted">Il gruppo di cui fai parte</span>
            </div>

            <h2 className="mt-3 text-h4">{s.cluster_title}</h2>

            <dl className="mt-4 flex gap-8">
              <Numero valore={s.cluster_citizens ?? 0} etichetta="cittadini" />
              <Numero valore={s.cluster_reports ?? 0} etichetta="segnalazioni" />
            </dl>

            {s.cluster_is_public ? (
              <Link
                href={`/gruppi/${s.cluster_id}`}
                className={`${bottoneVarianti({ variante: 'secondary' })} mt-5`}
              >
                Vedi il gruppo
              </Link>
            ) : (
              <p className="mt-4 text-small text-ink-muted">
                Il gruppo non è ancora pubblico: aspettiamo che siano almeno tre
                persone diverse, perché con meno si capirebbe chi ha parlato.
              </p>
            )}
          </CardIstituzionale>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/segnala" className={bottoneVarianti({ variante: 'primary' })}>
            Segnala un altro problema
          </Link>
          <Link href="/gruppi" className={bottoneVarianti({ variante: 'secondary' })}>
            Guarda i gruppi attivi
          </Link>
        </div>

        <p className="mt-8 text-small text-ink-muted">
          Questo indirizzo vale solo per la tua segnalazione. Chi non ce l’ha non
          può vederla: tienilo per te se non vuoi condividerla.
        </p>
      </div>
    </>
  )
}
