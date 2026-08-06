/**
 * Il termine di legge, scritto in parole.
 *
 * Nessuna informazione affidata al colore: «scaduto da 12 giorni» si legge
 * anche in bianco e nero e si sente da uno screen reader. Un pallino rosso no.
 *
 * Il fuso è fissato su Europa/Roma perché il server gira in UTC: senza, un atto
 * inviato la sera del 30 comparirebbe come inviato il 31, e su un termine di
 * trenta giorni un giorno sbagliato è un sollecito mandato troppo presto.
 */

const FUSO = 'Europe/Rome'

export function formattaData(valore: string | null | undefined): string {
  if (!valore) return '—'
  const data = new Date(valore)
  if (Number.isNaN(data.getTime())) return '—'
  return data.toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: FUSO,
  })
}

/**
 * Giorni che mancano al termine. Negativo se è già passato, null se non c'è.
 * Si conta sui giorni interi: le ore non interessano a nessuno qui.
 */
export function giorniAllaScadenza(deadlineAt: string | null | undefined): number | null {
  if (!deadlineAt) return null
  const scadenza = new Date(deadlineAt)
  if (Number.isNaN(scadenza.getTime())) return null
  const millisecondiAlGiorno = 24 * 60 * 60 * 1000
  return Math.ceil((scadenza.getTime() - Date.now()) / millisecondiAlGiorno)
}

export function testoScadenza(deadlineAt: string | null | undefined): string {
  const giorni = giorniAllaScadenza(deadlineAt)
  if (giorni === null) return 'nessun termine'
  if (giorni > 1) return `fra ${giorni} giorni`
  if (giorni === 1) return 'domani'
  if (giorni === 0) return 'scade oggi'
  if (giorni === -1) return 'scaduto da ieri'
  return `scaduto da ${Math.abs(giorni)} giorni`
}

export function Scadenza({
  deadlineAt,
  deadlineBasis,
}: {
  deadlineAt: string | null | undefined
  deadlineBasis?: string | null
}) {
  if (!deadlineAt) {
    return (
      <span className="text-ink-muted">
        Nessun termine di legge
      </span>
    )
  }

  const giorni = giorniAllaScadenza(deadlineAt)
  const scaduto = giorni !== null && giorni < 0

  return (
    <span className="flex flex-col">
      <span className={scaduto ? 'font-semibold text-danger' : 'text-ink'}>
        {formattaData(deadlineAt)} — {testoScadenza(deadlineAt)}
      </span>
      {deadlineBasis && (
        <span className="text-caption text-ink-muted">{deadlineBasis}</span>
      )}
    </span>
  )
}
