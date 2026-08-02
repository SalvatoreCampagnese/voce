'use client'

// Client Component per un solo motivo: useActionState mostra gli errori accanto
// al campo sbagliato e disabilita il pulsante durante l'invio (il doppio tap su
// rete lenta è il difetto più probabile di questa pagina).
// Senza JavaScript il modulo resta un <form> POST e funziona lo stesso.

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Bottone, CampoModulo, CalloutAvviso } from '@voce/ui'
import { inviaSegnalazione, type StatoModulo } from './azioni'

function PulsanteInvia() {
  const { pending } = useFormStatus()
  return (
    <Bottone type="submit" disabled={pending} larghezza="piena">
      {pending ? 'Invio in corso…' : 'Invia la segnalazione'}
    </Bottone>
  )
}

export function ModuloSegnalazione() {
  const [stato, azione] = useActionState<StatoModulo, FormData>(inviaSegnalazione, {})
  const errori = stato.errori ?? {}
  const precedenti = stato.valoriPrecedenti ?? {}

  return (
    <form action={azione} className="flex flex-col gap-6" noValidate>
      {errori.testo && (
        <CalloutAvviso tono="errore" titolo="Controlla la segnalazione">
          {errori.testo}
        </CalloutAvviso>
      )}

      <CampoModulo
        id="testo"
        etichetta="Cosa è successo?"
        aiuto="Scrivi come parli. Conta di più un fatto preciso che una frase elegante."
        errore={errori.testo}
        obbligatorio
      >
        {(attributi) => (
          <textarea
            {...attributi}
            name="testo"
            rows={7}
            defaultValue={precedenti.testo}
            placeholder="Es. Ieri al pronto soccorso del San Paolo ho aspettato 8 ore per un dolore al petto. Non è la prima volta."
          />
        )}
      </CampoModulo>

      <CampoModulo
        id="luogo"
        etichetta="Dove è successo?"
        aiuto="Una via, una piazza, una struttura. Serve a unirti a chi ha lo stesso problema nella tua zona."
        errore={errori.luogo}
      >
        {(attributi) => (
          <input
            {...attributi}
            name="luogo"
            type="text"
            defaultValue={precedenti.luogo}
            placeholder="Es. via Ferrari, o pronto soccorso del San Paolo"
          />
        )}
      </CampoModulo>

      <div className="grid gap-6 sm:grid-cols-2">
        <CampoModulo id="citta" etichetta="Comune" errore={errori.citta}>
          {(attributi) => (
            <input
              {...attributi}
              name="citta"
              type="text"
              defaultValue={precedenti.citta}
              placeholder="Es. Milano"
            />
          )}
        </CampoModulo>

        <CampoModulo id="quartiere" etichetta="Quartiere" errore={errori.quartiere}>
          {(attributi) => (
            <input
              {...attributi}
              name="quartiere"
              type="text"
              defaultValue={precedenti.quartiere}
              placeholder="Es. Corvetto"
            />
          )}
        </CampoModulo>
      </div>

      <CampoModulo
        id="contatto"
        etichetta="Come ti avvisiamo?"
        aiuto="Email o telefono. Lo usiamo solo per dirti quando la tua segnalazione diventa un’azione: non lo mostriamo a nessuno."
        errore={errori.contatto}
        obbligatorio
      >
        {(attributi) => (
          <input
            {...attributi}
            name="contatto"
            type="text"
            autoComplete="email"
            defaultValue={precedenti.contatto}
            placeholder="nome@esempio.it"
          />
        )}
      </CampoModulo>

      <PulsanteInvia />

      <p className="text-small text-ink-muted">
        Quello che scrivi resta privato. Nelle pagine pubbliche compare solo una
        versione senza nomi, e la posizione viene arrotondata a 300 metri.
      </p>
    </form>
  )
}
