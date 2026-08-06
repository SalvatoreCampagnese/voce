import Link from 'next/link'
import { Tricolore, bottoneVarianti } from '@voce/ui'

import { esci } from '@/app/admin/accesso/azioni'
import type { AdminSessione } from '@/lib/auth/admin'
import { NavigazioneAdmin } from './NavigazioneAdmin'

/**
 * Testata del pannello: stessa banda tricolore, stessa tipografia e stesso
 * tono delle pagine pubbliche. Non è un cruscotto: è un ufficio.
 *
 * La fascia scura non è decorazione. Chi apre questa pagina sta per leggere il
 * racconto di una persona vera — un pronto soccorso, una minaccia, una casa
 * senza acqua — e il nome di chi è collegato compare accanto all'avviso perché
 * ogni decisione di moderazione resta firmata nel registro.
 */
export function IntestazioneAdmin({ admin }: { admin: AdminSessione | null }) {
  return (
    <>
      <Tricolore />

      <header className="border-b border-surface-strong bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <Link href="/admin" className="flex items-center gap-3 rounded">
            <span className="flex flex-col">
              <span className="text-h4 font-bold text-ink">VOCE</span>
              <span className="text-caption text-ink-muted">Pannello di amministrazione</span>
            </span>
          </Link>

          <Link
            href="/"
            className="inline-flex min-h-11 items-center text-small font-semibold text-primary-600 underline underline-offset-4"
          >
            Vai al sito pubblico
          </Link>
        </div>
      </header>

      {admin && (
        <>
          <div className="on-dark bg-surface-dark text-white">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
              <p className="text-small">
                <span className="font-semibold">Stai lavorando su dati reali di cittadini.</span>{' '}
                Leggi solo quello che ti serve per decidere.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <p className="text-small">
                  Sei collegato come <span className="font-semibold">{admin.fullName}</span>
                </p>
                {/* Server Action, non fetch: l'uscita funziona anche se lo
                    script non carica. Su un pannello che apre dati sensibili
                    l'uscita è la funzione che deve rompersi per ultima. */}
                <form action={esci}>
                  <button
                    type="submit"
                    className={bottoneVarianti({ variante: 'secondary' }) + ' bg-white'}
                  >
                    Esci
                  </button>
                </form>
              </div>
            </div>
          </div>

          <NavigazioneAdmin />
        </>
      )}
    </>
  )
}
