import { AzioneConConferma } from '@/components/admin/shell/AzioneConConferma'

/**
 * Una decisione su un atto, con conferma e con il caso «adesso non si può».
 *
 * La conferma vera la fa `AzioneConConferma` del guscio: un `<details>` che
 * funziona senza JavaScript e ha lo stesso aspetto in tutto il pannello. Qui si
 * aggiunge la sola cosa che manca e che su un atto serve — dire perché
 * un'operazione non è disponibile adesso.
 *
 * Un bottone disattivato senza spiegazione è la forma più efficace di far
 * credere che il pannello sia rotto: «segna come inviato» che non risponde
 * porta a ricaricare tre volte, non a capire che prima va revisionato il testo.
 * Per questo qui non c'è un `disabled`, c'è una frase.
 */
export function ConfermaAzione({
  azione,
  campiNascosti,
  etichetta,
  domanda,
  conferma,
  variante = 'secondary',
  disabilitata,
  motivoDisabilitata,
}: {
  /** Server Action invocata dal modulo di conferma. */
  azione: (formData: FormData) => void | Promise<void>
  /** Campi passati all'azione, tipicamente l'identificativo della riga. */
  campiNascosti: Record<string, string>
  /** Testo del comando che apre la conferma. */
  etichetta: string
  /** Cosa succede davvero, per esteso. Non riassumerlo. */
  domanda: string
  /** Testo del bottone che esegue. */
  conferma: string
  variante?: 'primary' | 'secondary' | 'danger'
  disabilitata?: boolean
  /** Perché non si può fare adesso. Obbligatorio quando `disabilitata`. */
  motivoDisabilitata?: string
}) {
  if (disabilitata) {
    return (
      <div className="rounded border border-surface-strong bg-surface-alt p-4">
        <p className="text-small font-semibold text-ink-muted">{etichetta}</p>
        <p className="mt-1 text-small text-ink-muted">{motivoDisabilitata}</p>
      </div>
    )
  }

  return (
    <AzioneConConferma
      azione={azione}
      campi={campiNascosti}
      etichetta={etichetta}
      domanda={domanda}
      conferma={conferma}
      variante={variante}
    />
  )
}
