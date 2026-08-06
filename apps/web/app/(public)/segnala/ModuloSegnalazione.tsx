'use client'

// Client Component per un solo motivo: useActionState mostra gli errori accanto
// al campo sbagliato e disabilita il pulsante durante l'invio (il doppio tap su
// rete lenta è il difetto più probabile di questa pagina).
// Senza JavaScript il modulo resta un <form> POST e funziona lo stesso.

import { useActionState, useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { Bottone, CampoModulo } from '@voce/ui'
import { SuggerimentiGruppi } from '@/components/ricerca/SuggerimentiGruppi'
import { inviaSegnalazione, type StatoModulo } from './azioni'

/** Ordine dei campi nella pagina: decide su quale finisce il focus. */
const ORDINE_CAMPI = ['testo', 'luogo', 'citta', 'quartiere', 'contatto'] as const

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

  const campiInErrore = ORDINE_CAMPI.filter((campo) => errori[campo])

  // Una frase sola, in cima. Il messaggio del server (salvataggio fallito,
  // troppe segnalazioni) vince: non è colpa di un campo e va detto per intero.
  const avviso =
    stato.messaggio ??
    (campiInErrore.length === 0
      ? ''
      : campiInErrore.length === 1
        ? 'La segnalazione non è partita: c’è un campo da correggere.'
        : `La segnalazione non è partita: ci sono ${campiInErrore.length} campi da correggere.`)

  // Senza questo, chi usa uno screen reader preme «Invia», non sente niente e
  // resta a fissare un modulo che sembra andato. Il focus sul primo campo
  // sbagliato fa leggere etichetta, aiuto ed errore, che sono già collegati al
  // controllo con aria-describedby; l'avviso qui sopra dà il quadro.
  // Senza JavaScript non serve niente di tutto questo: la pagina si ricarica e
  // gli errori sono già nel documento servito.
  const regioneAvviso = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const campi = stato.errori
    const primo = campi ? ORDINE_CAMPI.find((campo) => campi[campo]) : undefined
    if (primo) {
      document.getElementById(primo)?.focus()
      return
    }
    // Nessun campo sbagliato ma il salvataggio è fallito: il focus va
    // sull'avviso, altrimenti su un modulo lungo resta sopra lo schermo e non
    // lo trova nessuno.
    if (stato.messaggio) regioneAvviso.current?.focus()
  }, [stato])

  // Copie del testo e del comune SOLO per cercare i gruppi simili mentre si
  // scrive (PLAN2 §4.2). I campi restano non controllati con defaultValue: il
  // valore che conta è quello che il browser invia al submit, e resta corretto
  // anche se React non è mai partito.
  const [testo, setTesto] = useState(precedenti.testo ?? '')
  const [citta, setCitta] = useState(precedenti.citta ?? '')

  return (
    <form action={azione} className="flex flex-col gap-6" noValidate>
      {/* Regione viva SEMPRE presente nel DOM: un contenitore creato insieme al
          suo contenuto spesso non viene annunciato, ed è esattamente il difetto
          che questo blocco chiude. Quando è vuota resta `sr-only`, cioè in
          posizione assoluta: non è un elemento del flex e non apre uno spazio
          bianco in cima al modulo. Quando ha qualcosa da dire diventa un
          riquadro visibile, così l'avviso arriva a tutti, non solo a chi
          ascolta. */}
      <div
        ref={regioneAvviso}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        tabIndex={-1}
        className={
          avviso
            ? 'rounded border-l-4 border-danger bg-danger-bg p-4 text-body font-semibold text-danger-text'
            : 'sr-only'
        }
      >
        {avviso}
      </div>

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
            onChange={(evento) => setTesto(evento.target.value)}
            placeholder="Es. Ieri al pronto soccorso del San Paolo ho aspettato 8 ore per un dolore al petto. Non è la prima volta."
          />
        )}
      </CampoModulo>

      {/* Compare solo quando c'è qualcosa da mostrare e non tocca l'invio. */}
      <SuggerimentiGruppi testo={testo} citta={citta} />

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
              onChange={(evento) => setCitta(evento.target.value)}
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

      {/* L'aiuto diceva «email o telefono» e prometteva un avviso a entrambi.
          Il canale WhatsApp non è collegato: chi lascia solo un numero non
          riceve niente, e la notifica nasce già fallita
          (lib/notifications/index.ts). Il numero resta accettato — chi non ha
          una casella di posta deve poter segnalare lo stesso — ma la pagina
          dice come stanno le cose invece di promettere. */}
      <CampoModulo
        id="contatto"
        etichetta="Come ti avvisiamo?"
        aiuto="Scrivi la tua email: è l’unico recapito su cui riusciamo ad avvisarti. Con un numero di telefono, per ora, non ci riusciamo. Non lo mostriamo a nessuno."
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

      {/* Il rimando all'informativa sta QUI, nel punto in cui la persona sta
          per consegnare il suo racconto, e non solo in fondo alla pagina: chi
          decide se fidarsi lo decide adesso, non dopo aver premuto invia. */}
      <p className="text-small text-ink-muted">
        Quello che scrivi resta privato. Nelle pagine pubbliche compare solo una
        versione senza nomi, e la posizione viene arrotondata a 300 metri.{' '}
        <Link
          href="/privacy"
          className="font-semibold text-primary-600 underline underline-offset-4"
        >
          Come trattiamo i tuoi dati
        </Link>
        .
      </p>
    </form>
  )
}
