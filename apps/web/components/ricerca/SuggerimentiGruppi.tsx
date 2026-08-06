'use client'

// Client Component per un motivo solo: mostrare i gruppi simili MENTRE la
// persona scrive. Serve un ascolto della digitazione, un ritardo dall'ultimo
// tasto e la possibilità di annullare la richiesta precedente — tre cose che
// un Server Component non può fare.
//
// È un miglioramento progressivo e nient'altro: senza JavaScript questo blocco
// semplicemente non compare, il modulo resta un <form> con Server Action e la
// segnalazione parte identica. Non deve mai impedire o rallentare l'invio.

import { useEffect, useRef, useState } from 'react'
import { CATEGORY_LABELS } from '@voce/db'
import type { GruppoTrovato } from '@/lib/queries/ricerca'

/** Sotto questa lunghezza il racconto non dice ancora abbastanza. Uguale al limite della route. */
const MIN_CARATTERI = 40

/** Ritardo dall'ultimo tasto: sotto il secondo si paga un embedding per ogni parola. */
const RITARDO_MS = 1200

export function SuggerimentiGruppi({
  testo,
  citta,
}: {
  testo: string
  citta?: string
}) {
  const [gruppi, setGruppi] = useState<GruppoTrovato[]>([])
  const [inCorso, setInCorso] = useState(false)
  const ultimaQuery = useRef<string>('')

  // Se il racconto è ancora troppo corto non mostriamo niente. È una cosa che si
  // DERIVA dal testo corrente, non uno stato da azzerare: svuotare `gruppi` con
  // una setState dentro l'effetto provocherebbe un secondo render a ogni tasto
  // battuto sotto la soglia, cioè proprio mentre la persona sta scrivendo.
  const query = testo.trim().replace(/\s+/g, ' ')
  const abbastanzaLungo = query.length >= MIN_CARATTERI
  const gruppiVisibili = abbastanzaLungo ? gruppi : []

  useEffect(() => {
    if (!abbastanzaLungo) {
      ultimaQuery.current = ''
      return
    }

    // Stessa domanda già fatta: non si paga due volte lo stesso embedding.
    if (query === ultimaQuery.current) return

    const annulla = new AbortController()
    const attesa = setTimeout(async () => {
      ultimaQuery.current = query
      setInCorso(true)
      try {
        const risposta = await fetch('/api/ricerca/suggerimenti', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ testo: query.slice(0, 600), citta: citta || undefined }),
          signal: annulla.signal,
        })
        if (!risposta.ok) {
          // Un 429 o un errore di rete qui non è un problema del cittadino:
          // si resta in silenzio, il modulo continua a funzionare.
          setGruppi([])
          return
        }
        const dati = (await risposta.json()) as { gruppi?: GruppoTrovato[] }
        setGruppi(dati.gruppi ?? [])
      } catch {
        // Richiesta annullata o rete caduta: nessun messaggio, nessun rumore.
        setGruppi([])
      } finally {
        setInCorso(false)
      }
    }, RITARDO_MS)

    return () => {
      clearTimeout(attesa)
      annulla.abort()
    }
  }, [query, abbastanzaLungo, citta])

  // L'annuncio è UNA frase. Prima la regione viva avvolgeva tutto il pannello:
  // a ogni ricerca lo screen reader rileggeva titolo, spiegazione e ogni
  // scheda, in mezzo a una persona che sta ancora scrivendo il suo racconto.
  // Qui si sente solo quanti gruppi sono comparsi; il pannello resta lì da
  // leggere quando si arriva. Testo derivato, non uno stato: se non cambia,
  // non viene riletto.
  const annuncio =
    gruppiVisibili.length === 0
      ? ''
      : gruppiVisibili.length === 1
        ? 'Trovato 1 gruppo simile qui sotto.'
        : `Trovati ${gruppiVisibili.length} gruppi simili qui sotto.`

  return (
    <>
      {/* Sempre presente nel DOM: una regione viva creata insieme al suo
          contenuto spesso non viene annunciata. È sr-only, quindi in posizione
          assoluta: non è un elemento del flex e non apre uno spazio vuoto nel
          modulo quando non c'è niente da dire. */}
      <p role="status" aria-live="polite" className="sr-only">
        {annuncio}
      </p>

      <div className="empty:hidden">
        {inCorso && gruppiVisibili.length === 0 && (
          <p className="text-small text-ink-muted">Cerco se qualcuno ha già raccontato questo…</p>
        )}

        {gruppiVisibili.length > 0 && (
          <section className="rounded-card border border-primary-200 bg-primary-50 p-4">
            <h2 className="text-h4">Non sei solo</h2>
            <p className="mt-2 text-small text-ink">
              Altri cittadini hanno raccontato qualcosa di simile. Invia comunque la
              tua segnalazione: la uniamo al gruppo giusto e il gruppo cresce.
            </p>

            <ul className="mt-4 flex flex-col gap-3">
              {gruppiVisibili.map((gruppo) => (
                <li
                  key={gruppo.clusterId}
                  className="rounded border border-primary-100 bg-white p-3"
                >
                  <p className="text-caption text-ink-muted">
                    {CATEGORY_LABELS[gruppo.category] ?? 'Altro'}
                    {gruppo.city ? ` · ${gruppo.city}` : ''}
                    {gruppo.neighborhood ? ` · ${gruppo.neighborhood}` : ''}
                  </p>
                  <p className="mt-1 text-body font-semibold text-ink">{gruppo.title}</p>
                  <p className="mt-1 text-small text-ink-muted">{gruppo.summary}</p>
                  <p className="mt-2 text-small font-semibold text-ink">
                    {gruppo.citizensCount} cittadini · {gruppo.reportsCount} segnalazioni
                  </p>
                  <a
                    href={`/gruppi/${gruppo.clusterId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex min-h-11 items-center text-small font-semibold text-primary-600 underline underline-offset-4"
                  >
                    Aggiungi la tua voce a questo gruppo
                    <span className="sr-only"> (si apre in una nuova scheda)</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  )
}
