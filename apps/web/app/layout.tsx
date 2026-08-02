import type { Metadata } from 'next'
import { Titillium_Web } from 'next/font/google'
import './globals.css'

/**
 * Titillium Web è il font istituzionale della PA italiana.
 * next/font lo self-hosta a build time: nessuna richiesta a Google in
 * produzione (privacy) e nessun salto di layout al caricamento.
 */
const titillium = Titillium_Web({
  variable: '--font-titillium',
  subsets: ['latin'],
  weight: ['300', '400', '600', '700'],
  display: 'swap',
})

const APP_URL = process.env.APP_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: 'VOCE — Il sindacato civico dei cittadini',
    template: '%s · VOCE',
  },
  description:
    'Racconta un problema del tuo quartiere. Se non sei da solo, VOCE lo trasforma in un’azione collettiva.',
  openGraph: {
    type: 'website',
    locale: 'it_IT',
    siteName: 'VOCE',
    title: 'VOCE — Il sindacato civico dei cittadini',
    description:
      'Le segnalazioni dei cittadini diventano gruppi, i gruppi diventano atti. Tutto pubblico e verificabile.',
  },
  robots: { index: true, follow: true },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={`${titillium.variable} h-full`}>
      <body className="flex min-h-full flex-col bg-surface">
        {/* Primo elemento focusabile della pagina: chi naviga da tastiera deve
            poter saltare header e menu senza attraversarli a ogni pagina. */}
        <a href="#contenuto-principale" className="skip-link">
          Vai al contenuto
        </a>
        {children}
      </body>
    </html>
  )
}
