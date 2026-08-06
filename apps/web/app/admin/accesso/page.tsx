import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Bottone, CalloutAvviso, CampoModulo, CardIstituzionale } from '@voce/ui'

import { getAdminCorrente } from '@/lib/auth/admin'
import { chiediCodice, verificaCodice } from './azioni'

/**
 * Accesso al pannello, in due passi su una sola pagina.
 *
 * Nessun componente client: entrambi i moduli sono Server Action e funzionano
 * con JavaScript spento. Lo stato del passo viaggia nell'indirizzo, l'email in
 * un cookie httpOnly (vedi `azioni.ts`).
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Accesso al pannello',
  // Nessun motore di ricerca deve indicizzare la porta di servizio.
  robots: { index: false, follow: false },
}

/**
 * Un messaggio per ogni codice di errore.
 *
 * Nessuno di questi testi dice se un indirizzo appartiene a un amministratore:
 * chi provasse indirizzi a caso leggerebbe sempre la stessa cosa.
 */
const MESSAGGI: Record<string, string> = {
  'email-non-valida': 'Controlla l’indirizzo: manca qualcosa.',
  'invio-non-riuscito':
    'Non siamo riusciti a inviare il codice. Riprova fra qualche minuto.',
  'sessione-scaduta': 'È passato troppo tempo. Chiedi un codice nuovo.',
  'codice-non-valido': 'Il codice non è corretto oppure è scaduto. Chiedine un altro.',
  'accesso-non-abilitato':
    'Questo indirizzo non ha accesso al pannello. Se dovresti averlo, chiedi che il tuo invito venga riaperto.',
}

export default async function AccessoPage({ searchParams }: PageProps<'/admin/accesso'>) {
  const parametri = await searchParams

  // Chi è già dentro non ha niente da fare qui.
  const admin = await getAdminCorrente()
  if (admin) redirect('/admin')

  const passo = parametri.passo === 'codice' ? 'codice' : 'email'
  const codiceErrore = typeof parametri.errore === 'string' ? parametri.errore : null
  const errore = codiceErrore ? (MESSAGGI[codiceErrore] ?? MESSAGGI['invio-non-riuscito']) : null
  const uscita = parametri.uscita === 'fatta'

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-h1">Accesso al pannello</h1>
      <p className="mt-3 text-body text-ink-muted">
        Il pannello serve a moderare le segnalazioni e a revisionare gli atti.
        Ti mandiamo un codice via email: non c’è nessuna password da custodire.
      </p>

      {uscita && (
        <CalloutAvviso tono="successo" titolo="Sei uscito" className="mt-6">
          La sessione è chiusa. Puoi rientrare quando vuoi.
        </CalloutAvviso>
      )}

      {/* role="alert" tramite CalloutAvviso: chi usa uno screen reader sente
          l'errore senza doverlo cercare. */}
      {errore && (
        <CalloutAvviso tono="errore" titolo="Non è andata" className="mt-6">
          {errore}
        </CalloutAvviso>
      )}

      <CardIstituzionale className="mt-6">
        {passo === 'email' ? (
          <form action={chiediCodice} className="flex flex-col gap-5">
            <CampoModulo
              id="email"
              etichetta="Il tuo indirizzo email"
              aiuto="Deve essere l’indirizzo con cui sei stato abilitato."
              obbligatorio
              errore={codiceErrore === 'email-non-valida' ? MESSAGGI['email-non-valida'] : undefined}
            >
              {(attributi) => (
                <input
                  {...attributi}
                  type="email"
                  name="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="nome.cognome@comune.it"
                  required
                />
              )}
            </CampoModulo>

            <Bottone type="submit" larghezza="piena">
              Mandami il codice
            </Bottone>
          </form>
        ) : (
          <form action={verificaCodice} className="flex flex-col gap-5">
            <p className="text-body text-ink">
              Se l’indirizzo è abilitato, fra poco ricevi un codice di sei cifre.
              Vale pochi minuti.
            </p>

            <CampoModulo
              id="codice"
              etichetta="Codice ricevuto via email"
              aiuto="Sei cifre, senza spazi."
              obbligatorio
              errore={
                codiceErrore === 'codice-non-valido' ? MESSAGGI['codice-non-valido'] : undefined
              }
            >
              {(attributi) => (
                <input
                  {...attributi}
                  type="text"
                  name="codice"
                  // Sulla tastiera del telefono compaiono i numeri, e il
                  // gestore di password non prova a riempirlo con altro.
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="123456"
                  required
                />
              )}
            </CampoModulo>

            <Bottone type="submit" larghezza="piena">
              Entra
            </Bottone>

            <a
              href="/admin/accesso"
              className="inline-flex min-h-11 items-center text-small font-semibold text-primary-600 underline underline-offset-4"
            >
              Usa un altro indirizzo
            </a>
          </form>
        )}
      </CardIstituzionale>

      <p className="mt-6 text-small text-ink-muted">
        Gli amministratori si aggiungono solo dal database, con un invito che
        vale una volta sola. Da questa pagina non se ne creano.
      </p>
    </div>
  )
}
