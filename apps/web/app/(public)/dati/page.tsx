import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumb, CalloutAvviso, CardIstituzionale } from '@voce/ui'

/**
 * La pagina che spiega i dati aperti (PLAN2 §6.1).
 *
 * Non legge niente dal database: è testo, quindi resta statica e non costa una
 * query a ogni visita. Serve a rendere usabili le quattro raccolte senza dover
 * chiedere niente a nessuno — che è metà del motivo per cui esistono.
 */

export const metadata: Metadata = {
  title: 'Dati aperti',
  description:
    'Gruppi, atti, risposte e confronto fra comuni in formato JSON e CSV, senza registrazione.',
}

interface Raccolta {
  titolo: string
  indirizzo: string
  descrizione: string
  campi: string[]
  parametri: string[]
  esempi: string[]
}

const RACCOLTE: Raccolta[] = [
  {
    titolo: 'I gruppi',
    indirizzo: '/api/public/gruppi',
    descrizione:
      'Un gruppo per riga: di cosa parla, dove, quante persone lo hanno segnalato.',
    campi: [
      'id',
      'titolo',
      'riassunto',
      'categoria',
      'comune',
      'quartiere',
      'segnalazioni',
      'cittadini',
      'stato',
      'latitudine',
      'longitudine',
      'raggio_metri',
      'soglia_raggiunta_il',
      'creato_il',
      'aggiornato_il',
    ],
    parametri: ['formato', 'citta', 'categoria', 'dal', 'al', 'limite', 'offset'],
    esempi: [
      '/api/public/gruppi',
      '/api/public/gruppi?citta=Milano&formato=csv',
      '/api/public/gruppi?categoria=mobilita&dal=2026-01-01&al=2026-06-30',
    ],
  },
  {
    titolo: 'Gli atti',
    indirizzo: '/api/public/atti',
    descrizione:
      'Gli atti civici nati dai gruppi: tipo, destinatario, firme, termine di legge.',
    campi: [
      'id',
      'gruppo_id',
      'tipo',
      'stato',
      'titolo',
      'destinatario',
      'revisionato',
      'revisionato_da',
      'firme',
      'firme_obiettivo',
      'inviato_il',
      'risposta_ricevuta_il',
      'termine_il',
      'termine_giorni',
      'termine_base',
      'seguito_di',
      'creato_il',
      'pdf_url',
      'docx_url',
      'testo_markdown',
      'testo_risposta',
    ],
    parametri: ['formato', 'citta', 'tipo', 'stato', 'dal', 'al', 'limite', 'offset'],
    esempi: [
      '/api/public/atti?stato=inviata',
      '/api/public/atti?tipo=accesso_civico&formato=csv',
      '/api/public/atti?citta=Napoli&limite=500',
    ],
  },
  {
    titolo: 'Le risposte',
    indirizzo: '/api/public/risposte',
    descrizione:
      'Cosa hanno risposto le amministrazioni, con l’esito e il motivo del rifiuto.',
    campi: [
      'id',
      'atto_id',
      'esito',
      'motivo',
      'cita_art_5bis',
      'rimedio_proposto',
      'ricevuta_il',
      'confermata_il',
    ],
    parametri: ['formato', 'citta', 'esito', 'dal', 'al', 'limite', 'offset'],
    esempi: [
      '/api/public/risposte',
      '/api/public/risposte?esito=respinta&formato=csv',
      '/api/public/risposte?citta=Palermo',
    ],
  },
  {
    titolo: 'Il confronto fra comuni',
    indirizzo: '/api/public/comuni',
    descrizione:
      'Una riga per comune: quanto è stato segnalato, quanto è stato risposto e in quanti giorni.',
    campi: [
      'comune',
      'gruppi',
      'segnalazioni',
      'cittadini',
      'atti_inviati',
      'risposte_ricevute',
      'risposte_confermate',
      'giorni_medi_di_risposta',
      'accolte',
      'respinte',
      'interlocutorie',
      'irricevibili',
    ],
    parametri: ['formato', 'citta', 'limite', 'offset'],
    esempi: ['/api/public/comuni', '/api/public/comuni?formato=csv'],
  },
]

const PARAMETRI = [
  {
    nome: 'formato',
    valori: 'json · csv',
    spiegazione: 'Se non lo indichi ricevi JSON.',
  },
  {
    nome: 'citta',
    valori: 'nome del comune',
    spiegazione: 'Deve corrispondere esatto, comprese le maiuscole.',
  },
  {
    nome: 'categoria',
    valori: 'sanita · mobilita · ambiente · …',
    spiegazione: 'Solo sui gruppi.',
  },
  {
    nome: 'tipo · stato · esito',
    valori: 'valori elencati sopra',
    spiegazione: 'Un valore sbagliato ti dice quali sono ammessi.',
  },
  {
    nome: 'dal · al',
    valori: 'AAAA-MM-GG',
    spiegazione: 'Estremi inclusi. Le date si intendono in UTC.',
  },
  {
    nome: 'limite',
    valori: 'da 1 a 1000',
    spiegazione: 'Se non lo indichi ricevi 100 righe.',
  },
  {
    nome: 'offset',
    valori: 'da 0 in su',
    spiegazione: 'Serve a scaricare la pagina successiva.',
  },
]

const ESCLUSIONI = [
  'Il testo scritto dai cittadini. Non esce da qui in nessuna forma.',
  'La posizione esatta. Le coordinate sono arrotondate a circa 300 metri.',
  'L’ora precisa. Le date sono troncate all’ora o al giorno.',
  'I gruppi con meno di tre cittadini diversi. In un gruppo piccolo si riconosce chi ha parlato.',
  'Le segnalazioni e gli atti di prova, marcati come tali nel database.',
  'Il testo di un atto non ancora revisionato da una persona.',
  'Nomi, recapiti e identificativi di chi ha segnalato. Non esistono in nessuna colonna.',
]

export default function DatiPage() {
  return (
    <>
      <Breadcrumb voci={[{ etichetta: 'Home', href: '/' }, { etichetta: 'Dati aperti' }]} />

      <h1 className="text-h1">Dati aperti</h1>
      <p className="mt-3 max-w-2xl text-body text-ink-muted">
        Tutto quello che VOCE mostra in pagina si può anche scaricare. Senza
        registrarsi, senza chiedere una chiave, senza dire chi sei. Sono quattro
        raccolte in formato JSON e CSV, pensate per chi fa ricerca e per chi fa
        giornalismo.
      </p>

      <CalloutAvviso tono="info" titolo="Licenza" className="mt-8 max-w-2xl">
        <p>
          I dati sono rilasciati con licenza{' '}
          <a
            href="https://creativecommons.org/licenses/by/4.0/deed.it"
            className="font-semibold underline underline-offset-4"
          >
            Creative Commons Attribuzione 4.0
          </a>
          . Puoi usarli, anche a scopo commerciale. Devi solo citare VOCE come
          fonte. Il codice della piattaforma è invece rilasciato con licenza
          AGPL 3.0.
        </p>
      </CalloutAvviso>

      <section className="mt-12" aria-labelledby="raccolte">
        <h2 id="raccolte" className="text-h2">
          Le quattro raccolte
        </h2>
        <p className="mt-3 max-w-2xl text-body text-ink-muted">
          Ogni indirizzo risponde a una richiesta di lettura. Aggiungi{' '}
          <code className="font-mono text-small">?formato=csv</code> per
          scaricare un file al posto della risposta in JSON.
        </p>

        <div className="mt-6 grid gap-6">
          {RACCOLTE.map((raccolta) => (
            <CardIstituzionale as="article" key={raccolta.indirizzo}>
              <h3 className="text-h4">{raccolta.titolo}</h3>
              <p className="mt-1 font-mono text-small text-ink-muted">
                {raccolta.indirizzo}
              </p>
              <p className="mt-3 text-body text-ink-muted">{raccolta.descrizione}</p>

              <h4 className="mt-5 text-small font-semibold text-ink">Campi</h4>
              <p className="mt-1 font-mono text-small break-words text-ink-muted">
                {raccolta.campi.join(' · ')}
              </p>

              <h4 className="mt-4 text-small font-semibold text-ink">
                Parametri accettati
              </h4>
              <p className="mt-1 font-mono text-small break-words text-ink-muted">
                {raccolta.parametri.join(' · ')}
              </p>

              <h4 className="mt-4 text-small font-semibold text-ink">Esempi</h4>
              <ul className="mt-1 space-y-2">
                {raccolta.esempi.map((esempio) => (
                  <li key={esempio}>
                    <a
                      href={esempio}
                      className="inline-flex min-h-11 items-center rounded bg-surface-alt px-3 font-mono text-small break-all text-primary-700 underline underline-offset-4"
                    >
                      {esempio}
                    </a>
                  </li>
                ))}
              </ul>
            </CardIstituzionale>
          ))}
        </div>
      </section>

      <section className="mt-12" aria-labelledby="parametri">
        <h2 id="parametri" className="text-h2">
          I parametri, uno per uno
        </h2>

        {/* overflow-x-auto: su un telefono scorre la tabella, non tutta la
            pagina. tabIndex={0} + role="region" con nome: senza, chi naviga da
            tastiera non può scorrerla e le colonne di destra restano
            irraggiungibili (WCAG 2.1.1). */}
        <div
          className="mt-6 overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="Tabella dei parametri, scorrevole in orizzontale"
        >
          <table className="w-full min-w-[36rem] border-collapse text-body">
            <caption className="sr-only">
              Parametri accettati dalle quattro raccolte di dati aperti
            </caption>
            <thead>
              <tr className="border-b-2 border-surface-strong text-left">
                <th scope="col" className="py-3 pr-4 font-semibold">
                  Parametro
                </th>
                <th scope="col" className="py-3 pr-4 font-semibold">
                  Valori
                </th>
                <th scope="col" className="py-3 font-semibold">
                  Da sapere
                </th>
              </tr>
            </thead>
            <tbody>
              {PARAMETRI.map((parametro) => (
                <tr key={parametro.nome} className="border-b border-surface-strong">
                  <th
                    scope="row"
                    className="py-3 pr-4 text-left font-mono text-small font-semibold text-ink"
                  >
                    {parametro.nome}
                  </th>
                  <td className="py-3 pr-4 font-mono text-small">{parametro.valori}</td>
                  <td className="py-3 text-small text-ink-muted">
                    {parametro.spiegazione}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 max-w-2xl text-small text-ink-muted">
          Se sbagli un parametro ricevi il codice 400 e una spiegazione in
          italiano. Dice quale parametro correggere e quali valori accetta.
        </p>
      </section>

      <section className="mt-12" aria-labelledby="assenze">
        <h2 id="assenze" className="text-h2">
          Cosa non troverai, e perché
        </h2>
        <p className="mt-3 max-w-2xl text-body text-ink-muted">
          Queste raccolte leggono le stesse viste che alimentano le pagine
          pubbliche. Non c’è una via privilegiata: quello che non si vede in
          pagina non si scarica nemmeno da qui.
        </p>

        <ul className="mt-6 max-w-2xl space-y-3">
          {ESCLUSIONI.map((voce) => (
            <li key={voce} className="border-l-4 border-surface-strong pl-4 text-body">
              {voce}
            </li>
          ))}
        </ul>

        <p className="mt-6 max-w-2xl text-body text-ink-muted">
          Un dato mancante non è una dimenticanza. Ogni esclusione protegge una
          persona che ha raccontato un problema fidandosi di noi.
        </p>
      </section>

      <section className="mt-12" aria-labelledby="come-si-usano">
        <h2 id="come-si-usano" className="text-h2">
          Come si usano
        </h2>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <CardIstituzionale as="article">
            <h3 className="text-h4">Il file CSV</h3>
            <p className="mt-2 text-body text-ink-muted">
              Prima riga con i nomi delle colonne, virgola come separatore. Il
              file inizia con il segno UTF-8, così gli accenti si leggono anche
              in Excel. Se le colonne restano attaccate, apri il file da{' '}
              <em>Dati, Da testo/CSV</em> e scegli la virgola.
            </p>
          </CardIstituzionale>

          <CardIstituzionale as="article">
            <h3 className="text-h4">La risposta JSON</h3>
            <p className="mt-2 text-body text-ink-muted">
              Non è un elenco nudo ma un oggetto. Le righe stanno in{' '}
              <code className="font-mono text-small">dati</code>; accanto trovi{' '}
              <code className="font-mono text-small">totale</code>,{' '}
              <code className="font-mono text-small">generato_il</code>,{' '}
              <code className="font-mono text-small">licenza</code> e una nota.
              Così possiamo aggiungere un campo senza rompere il tuo programma.
            </p>
          </CardIstituzionale>

          <CardIstituzionale as="article">
            <h3 className="text-h4">Quanto sono aggiornati</h3>
            <p className="mt-2 text-body text-ink-muted">
              Le risposte restano in memoria cinque minuti. Per un lavoro
              ripetuto va benissimo interrogarle una volta al giorno.
            </p>
          </CardIstituzionale>

          <CardIstituzionale as="article">
            <h3 className="text-h4">Da un altro sito</h3>
            <p className="mt-2 text-body text-ink-muted">
              La lettura è consentita da qualunque origine. Puoi usare questi
              indirizzi da una pagina tua o da un quaderno di calcolo, senza
              passaggi intermedi.
            </p>
          </CardIstituzionale>
        </div>
      </section>

      <section className="mt-12" aria-labelledby="altro">
        <h2 id="altro" className="text-h2">
          Se cerchi altro
        </h2>
        <p className="mt-3 max-w-2xl text-body text-ink-muted">
          Il quadro pubblico mostra gli stessi numeri già letti e commentati.
          Manca un dato che ti servirebbe? Dillo: se si può pubblicare senza
          esporre nessuno, lo pubblichiamo.
        </p>
        <Link
          href="/trasparenza"
          className="mt-4 inline-flex min-h-11 items-center text-body font-semibold text-primary-600 underline underline-offset-4"
        >
          Vai al quadro pubblico
        </Link>
      </section>
    </>
  )
}
