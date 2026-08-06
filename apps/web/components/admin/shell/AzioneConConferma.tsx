import { bottoneVarianti, cn } from '@voce/ui'

/**
 * Azione irreversibile con conferma, senza una riga di JavaScript.
 *
 * `confirm()` non esiste quando lo script non carica, e una decisione di
 * moderazione presa per sbaglio con un tocco fuori bersaglio resta scritta nel
 * registro con il nome di chi l'ha presa. `<details>`/`<summary>` è un
 * componente di apertura nativo: funziona da tastiera, annuncia lo stato
 * aperto/chiuso agli screen reader e non costa nulla in rete.
 *
 * Il modulo dentro punta a una Server Action: anche l'invio funziona senza
 * JavaScript, come la pagina /segnala.
 */
export function AzioneConConferma({
  azione,
  campi,
  etichetta,
  domanda,
  conferma,
  variante = 'secondary',
}: {
  /** Server Action che riceve il modulo. */
  azione: (formData: FormData) => void | Promise<void>
  /** Campi nascosti da spedire con l'azione, di solito l'identificativo. */
  campi: Record<string, string>
  /** Testo del comando che apre la conferma. */
  etichetta: string
  /** Cosa succede davvero, in una frase. */
  domanda: string
  /** Testo del bottone che esegue. */
  conferma: string
  variante?: 'primary' | 'secondary' | 'danger'
}) {
  return (
    <details className="w-full sm:w-auto">
      <summary
        className={cn(
          bottoneVarianti({ variante: 'secondary' }),
          'w-full cursor-pointer list-none sm:w-auto [&::-webkit-details-marker]:hidden',
        )}
      >
        {etichetta}
      </summary>

      <div className="mt-3 rounded border border-border-control bg-surface-alt p-4">
        <p className="text-small text-ink">{domanda}</p>

        <form action={azione} className="mt-3">
          {Object.entries(campi).map(([nome, valore]) => (
            <input key={nome} type="hidden" name={nome} value={valore} />
          ))}
          <button type="submit" className={bottoneVarianti({ variante })}>
            {conferma}
          </button>
        </form>
      </div>
    </details>
  )
}
