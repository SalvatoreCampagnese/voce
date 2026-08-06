import type { Metadata } from 'next'

import { IntestazioneAdmin } from '@/components/admin/shell/IntestazioneAdmin'
import { getAdminCorrente } from '@/lib/auth/admin'

/**
 * Guscio del pannello di amministrazione.
 *
 * `force-dynamic` su tutto il ramo: una pagina di amministrazione non va mai in
 * cache. Una risposta con la coda di moderazione servita dalla cache a una
 * seconda persona è la fuga di dati che questo pannello esiste per evitare.
 *
 * IL LAYOUT NON FA DA GUARDIA. Chiama `getAdminCorrente()`, che non reindirizza:
 * dentro `/admin` c'è anche la pagina di accesso, e un layout che caccia via
 * chi non è collegato caccerebbe via anche chi sta provando a collegarsi.
 * Il controllo lo fa ogni pagina con `richiediAdmin()`, e prima ancora la RLS.
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: { default: 'Pannello', template: '%s · Pannello VOCE' },
  robots: { index: false, follow: false },
}

export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  const admin = await getAdminCorrente()

  return (
    <>
      <IntestazioneAdmin admin={admin} />

      <main id="contenuto-principale" className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        {children}
      </main>

      <footer className="border-t border-surface-strong bg-surface-alt">
        <div className="mx-auto max-w-6xl px-6 py-6 text-small text-ink-muted">
          <p>
            Ogni decisione presa qui resta firmata con il tuo nome e la data.
            Serve a poterci tornare sopra, non a controllarti.
          </p>
        </div>
      </footer>
    </>
  )
}
