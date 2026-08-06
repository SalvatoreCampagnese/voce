import Link from 'next/link'
import type { Metadata } from 'next'
import { Breadcrumb, CalloutAvviso, CardIstituzionale, bottoneVarianti } from '@voce/ui'

/**
 * «Cosa è VOCE» — la pagina di chi arriva senza sapere cos'è questo sito.
 *
 * Non legge niente dal database: è testo, quindi Next la rende statica e la
 * serve dalla cache. È voluto — è la pagina che una persona apre da un link su
 * una chat, spesso in mobilità e con poca rete: deve arrivare subito.
 *
 * Ogni frase qui dentro è stata verificata sul codice, non sul piano. Le
 * funzioni annunciate e non ancora collegate NON compaiono: una pagina che
 * promette più di quanto il sistema mantiene è esattamente il difetto che
 * PLAN2 §1.1 esiste per riparare.
 */

export const metadata: Metadata = {
  // Il template del layout aggiunge « · VOCE»: ripetere «VOCE» nel titolo
  // darebbe «Cosa è VOCE · VOCE».
  title: 'Cosa è',
  description:
    'VOCE mette insieme le segnalazioni dei cittadini sullo stesso problema e ne fa atti civici firmati da una persona.',
  alternates: { canonical: '/cosa-e' },
  openGraph: {
    type: 'website',
    locale: 'it_IT',
    siteName: 'VOCE',
    url: '/cosa-e',
    // `absolute` scavalca il template del layout: senza, l'anteprima condivisa
    // su una chat direbbe «Cosa è VOCE · VOCE».
    title: { absolute: 'Cosa è VOCE' },
    description:
      'Racconti un problema del quartiere. Se non sei solo, diventa un gruppo e poi un atto civico.',
  },
}

/** I passi del percorso, nell'ordine in cui li vive una persona. */
const PASSI: { titolo: string; testo: string }[] = [
  {
    titolo: 'Racconti',
    testo:
      'Scrivi cosa succede, dal sito o su Telegram. Bastano due righe, in italiano normale.',
  },
  {
    titolo: 'Confrontiamo',
    testo:
      'Il tuo racconto viene confrontato con quelli di chi vive vicino a te. Conta il problema, non le parole usate.',
  },
  {
    titolo: 'Nasce un gruppo',
    testo:
      'Se il problema è lo stesso, le segnalazioni diventano un gruppo. Compare in pagina quando almeno tre persone diverse ne hanno parlato.',
  },
  {
    titolo: 'Si prepara l’atto',
    testo:
      'Quando il gruppo è abbastanza numeroso, prepariamo le bozze. Accesso civico, diffida, esposto: dipende dal problema.',
  },
  {
    titolo: 'Una persona legge e firma',
    testo:
      'Nessun atto parte da solo. Qualcuno rilegge la bozza, la corregge e la firma con nome e cognome. Senza quella firma il testo non esce e non diventa pubblico.',
  },
  {
    titolo: 'Si aspetta la risposta',
    testo:
      'La legge dà all’amministrazione un tempo per rispondere. Quello che arriva, e quello che non arriva, finisce nel quadro pubblico.',
  },
]

/** Le tutele, con il danno concreto che ognuna previene. */
const TUTELE: { titolo: string; testo: string }[] = [
  {
    titolo: 'Il tuo testo non compare come lo hai scritto',
    testo:
      'Prima di uscire viene riscritto senza gli elementi che identificano qualcuno. Nomi, numeri civici, targhe, recapiti: via. I controlli sono due in fila, regole fisse e un secondo modello che rilegge. In pagina e negli atti va solo quella versione.',
  },
  {
    titolo: 'Le posizioni sono arrotondate',
    testo:
      'Il punto che indichi viene arrotondato a circa 300 metri prima di uscire dal server. Chi guarda vede una zona, non la tua porta.',
  },
  {
    titolo: 'Un gruppo diventa pubblico solo in tre',
    testo:
      'Sotto le tre persone diverse un gruppo resta invisibile. Mostrarlo prima equivarrebbe a indicare chi ha parlato, soprattutto in una via corta.',
  },
  {
    titolo: 'Il recapito serve solo per avvisarti',
    testo:
      'Lo usiamo per dirti quando la tua segnalazione diventa un’azione. Non compare in nessuna pagina e non entra in nessun atto.',
  },
]

/** I confini del progetto: PLAN2 §7, riga per riga. */
const CONFINI: { titolo: string; testo: string }[] = [
  {
    titolo: 'Non giudica le persone e non le classifica',
    testo:
      'Nessun punteggio di attendibilità sui cittadini. Chi scrive male o è arrabbiato conta quanto chiunque altro.',
  },
  {
    titolo: 'Non manda niente in automatico',
    testo:
      'Serve sempre una persona che legga l’atto e se ne assuma la responsabilità. È un vincolo del database, non una buona intenzione.',
  },
  {
    titolo: 'Non propone soluzioni tecniche',
    testo:
      'VOCE documenta il problema e chiede risposte. Progettare la strada spetta a chi ha competenza e mandato.',
  },
  {
    titolo: 'Non passa niente alle forze dell’ordine',
    testo:
      'Serve a farsi sentire da chi amministra. Non è uno strumento di controllo sui quartieri che dovrebbe difendere.',
  },
  {
    titolo: 'Non usa le tue parole per addestrare modelli',
    testo:
      'Restano tue. È anche il motivo per cui l’atto che ne nasce è vostro.',
  },
]

export default function CosaEPage() {
  return (
    <>
      <Breadcrumb voci={[{ etichetta: 'Home', href: '/' }, { etichetta: 'Cosa è VOCE' }]} />

      <h1 className="text-h1">Cosa è VOCE</h1>
      <p className="mt-4 max-w-2xl text-h4 font-normal text-ink-muted">
        VOCE raccoglie le segnalazioni dei cittadini sui problemi del quartiere.
        Quando più persone raccontano la stessa cosa, le mette insieme.
      </p>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-12 border-t border-surface-strong pt-10" aria-labelledby="che-cos-e">
        <h2 id="che-cos-e" className="text-h2">
          In poche parole
        </h2>
        <div className="mt-4 max-w-2xl space-y-3 text-body text-ink-muted">
          <p>
            Una buca, un lampione spento da mesi, un’attesa infinita allo
            sportello. Raccontato da una persona sola resta un caso isolato.
          </p>
          <p>
            Raccontato da dieci persone diventa un fatto documentato, difficile
            da ignorare. VOCE fa esattamente questo lavoro.
          </p>
          <p>
            Confronta la tua segnalazione con quelle di chi vive vicino a te. Se
            il problema è lo stesso, nasce un gruppo. Dai gruppi nascono atti
            civici veri, indirizzati a chi deve rispondere.
          </p>
          <p>
            Non devi creare un account. Devi solo raccontare quello che vedi.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-12 border-t border-surface-strong pt-10" aria-labelledby="come-funziona">
        <h2 id="come-funziona" className="text-h2">
          Come funziona, passo per passo
        </h2>

        {/* Lista numerata vera: il numero è informazione (l'ordine dei passi),
            quindi lo deve leggere anche chi usa uno screen reader. Il cerchio
            colorato è solo la sua veste grafica, ed è nascosto. */}
        <ol className="mt-6 grid gap-6 sm:grid-cols-2">
          {PASSI.map((passo, i) => (
            <CardIstituzionale as="li" key={passo.titolo}>
              <span
                className="flex h-10 w-10 items-center justify-center rounded-pill bg-primary-50 text-h4 font-bold text-primary-700"
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <h3 className="mt-4 text-h4">{passo.titolo}</h3>
              <p className="mt-2 text-body text-ink-muted">{passo.testo}</p>
            </CardIstituzionale>
          ))}
        </ol>

        <CalloutAvviso
          tono="attenzione"
          titolo="Le bozze le scrive una macchina, la responsabilità è di una persona"
          className="mt-8 max-w-2xl"
        >
          Le bozze degli atti sono preparate con l’aiuto dell’intelligenza
          artificiale. Prima di partire vengono rilette, corrette e firmate da
          una persona. Chi firma risponde di quel testo.
        </CalloutAvviso>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-12 border-t border-surface-strong pt-10" aria-labelledby="i-tuoi-dati">
        <h2 id="i-tuoi-dati" className="text-h2">
          Cosa succede a quello che scrivi
        </h2>
        <p className="mt-4 max-w-2xl text-body text-ink-muted">
          Chi segnala un problema del quartiere può avere dall’altra parte un
          vicino, un padrone di casa, un datore di lavoro. Per questo il testo
          pubblico non è mai il tuo.
        </p>

        <ul className="mt-6 grid gap-6 sm:grid-cols-2">
          {TUTELE.map((tutela) => (
            <CardIstituzionale as="li" key={tutela.titolo}>
              <h3 className="text-h4">{tutela.titolo}</h3>
              <p className="mt-2 text-body text-ink-muted">{tutela.testo}</p>
            </CardIstituzionale>
          ))}
        </ul>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-12 border-t border-surface-strong pt-10" aria-labelledby="cosa-non-fa">
        <h2 id="cosa-non-fa" className="text-h2">
          Cosa VOCE non fa
        </h2>
        <p className="mt-4 max-w-2xl text-body text-ink-muted">
          Sono tutte cose tecnicamente possibili. Sono state scartate apposta.
        </p>

        <ul className="mt-6 max-w-2xl space-y-5">
          {CONFINI.map((confine) => (
            <li key={confine.titolo} className="border-l-4 border-surface-strong pl-4">
              <h3 className="text-h4">{confine.titolo}</h3>
              <p className="mt-1 text-body text-ink-muted">{confine.testo}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-12 border-t border-surface-strong pt-10" aria-labelledby="chi-c-e-dietro">
        <h2 id="chi-c-e-dietro" className="text-h2">
          Chi c’è dietro, e con che licenza
        </h2>
        <div className="mt-4 max-w-2xl space-y-3 text-body text-ink-muted">
          <p>
            VOCE è un progetto libero. Il codice è pubblico su GitHub. Chiunque
            può leggerlo e controllare che faccia quello che dice.
          </p>
          <p>
            La licenza è AGPL-3.0. Chi usa questo codice per offrire un servizio
            deve ripubblicare le proprie modifiche. Un’infrastruttura civica non
            può diventare il prodotto chiuso di qualcuno.
          </p>
          <p>
            Anche i dati sono aperti, e non serve chiedere il permesso a
            nessuno. Gruppi, atti e risposte si scaricano dalla pagina dei{' '}
            <Link
              href="/dati"
              className="font-semibold text-primary-600 underline underline-offset-4"
            >
              dati aperti
            </Link>
            .
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-12 border-t border-surface-strong pt-10" aria-labelledby="cosa-puoi-fare">
        <h2 id="cosa-puoi-fare" className="text-h2">
          Cosa puoi fare adesso
        </h2>
        <p className="mt-4 max-w-2xl text-body text-ink-muted">
          Se hai un problema da raccontare, comincia da lì. Se vuoi prima
          guardare, i gruppi e i numeri sono aperti a tutti.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/segnala" className={bottoneVarianti({ variante: 'primary' })}>
            Racconta il tuo problema
          </Link>
          <Link href="/gruppi" className={bottoneVarianti({ variante: 'secondary' })}>
            Guarda i gruppi attivi
          </Link>
          <Link href="/trasparenza" className={bottoneVarianti({ variante: 'ghost' })}>
            Vedi il quadro pubblico
          </Link>
        </div>
      </section>
    </>
  )
}
