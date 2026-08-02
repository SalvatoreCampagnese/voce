import Link from 'next/link'
import type { Metadata } from 'next'
import { CalloutAvviso, bottoneVarianti } from '@voce/ui'

export const metadata: Metadata = {
  title: 'Segnalazione inviata',
  robots: { index: false },
}

export default function InviataPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-h1">Grazie, l’abbiamo ricevuta</h1>

      <CalloutAvviso tono="successo" titolo="Cosa succede adesso" className="mt-6">
        Stiamo confrontando la tua segnalazione con quelle di altri cittadini
        della tua zona. Ti scriviamo appena diventa parte di un’azione collettiva.
      </CalloutAvviso>

      <p className="mt-6 text-body text-ink-muted">
        Non serve fare altro. Se nessun altro segnala lo stesso problema, la tua
        segnalazione resta comunque registrata e visibile nel quadro pubblico
        quando il gruppo si forma.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/gruppi" className={bottoneVarianti({ variante: 'primary' })}>
          Guarda i gruppi attivi
        </Link>
        <Link href="/segnala" className={bottoneVarianti({ variante: 'secondary' })}>
          Segnala un altro problema
        </Link>
      </div>
    </div>
  )
}
