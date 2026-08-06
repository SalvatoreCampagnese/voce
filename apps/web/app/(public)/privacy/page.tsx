import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { Breadcrumb, CalloutAvviso, CardIstituzionale } from '@voce/ui'

/**
 * «Come trattiamo i tuoi dati» — l’informativa.
 *
 * Il collegamento nel footer di OGNI pagina puntava qui e riceveva 404. Una
 * persona che ha appena raccontato otto ore di attesa al pronto soccorso
 * cliccava l’unico link disponibile e trovava un errore: si era appena fidata.
 *
 * Ogni frase è ricavata dal codice, non da un modello copiato. Il testo dice
 * quello che il sistema fa DAVVERO — compreso ciò che non fa: oggi nessuna riga
 * cancella i dati dopo un periodo, e scriverlo è meno grave che dichiarare un
 * termine che nessuno applica.
 *
 * I campi che non stanno nel repo — titolare, indirizzo, contatto per i diritti,
 * responsabile della protezione dei dati, base giuridica — NON sono inventati.
 * Sono segnaposti `[DA COMPLETARE: …]`, visibili come tali, e la pagina si apre
 * dicendo che l’informativa non è completa. Un titolare inventato sarebbe una
 * dichiarazione falsa a chi si sta fidando: peggio di nessuna informativa.
 *
 * Server Component: non legge niente dal database, quindi resta statica.
 */

export const metadata: Metadata = {
  // Il template del layout aggiunge « · VOCE».
  title: 'Come trattiamo i tuoi dati',
  description:
    'Quali dati raccoglie VOCE, cosa ne fa, a chi li manda, per quanto tempo li tiene e come eserciti i tuoi diritti.',
  alternates: { canonical: '/privacy' },
  openGraph: {
    type: 'website',
    locale: 'it_IT',
    siteName: 'VOCE',
    url: '/privacy',
    title: { absolute: 'Come trattiamo i tuoi dati · VOCE' },
    description:
      'L’informativa di VOCE, scritta in italiano semplice: dati raccolti, uso, destinatari, tempi e diritti.',
  },
}

/**
 * Segnaposto per un dato che non sta nel repo e che nessuno può inventare.
 *
 * È un `<strong>` e non un colore: l’informazione «qui manca qualcosa» sta
 * nelle parole, quindi arriva anche a chi non vede il riquadro giallo
 * (WCAG 1.4.1). Il bordo serve solo a non farlo scorrere via con l’occhio.
 */
function DaCompletare({ children }: { children: ReactNode }) {
  return (
    <strong className="my-1 inline-block rounded border-2 border-warning bg-warning-bg px-2 py-1 text-ink">
      [DA COMPLETARE: {children}]
    </strong>
  )
}

/** I dati che il codice raccoglie davvero, uno per riquadro. */
const DATI: { titolo: string; testo: ReactNode }[] = [
  {
    titolo: 'Il testo della tua segnalazione',
    testo: (
      <>
        Quello che scrivi resta come lo hai scritto, in una colonna privata. Di
        quel testo teniamo anche due versioni lavorate. Una è riscritta in
        italiano ordinato. L’altra è senza gli elementi che identificano
        qualcuno. Il tuo racconto può contenere dati delicati: la tua salute, il
        tuo lavoro, la tua casa.
      </>
    ),
  },
  {
    titolo: 'Il recapito con cui ti avvisiamo',
    testo: (
      <>
        Dal sito lasci una email o un numero di telefono. Se scrivi al bot,
        conserviamo il tuo identificativo Telegram e il nome che mostri. Lo
        usiamo solo per avvisarti su ciò che riguarda la tua segnalazione. Non
        compare in nessuna pagina e non entra in nessun atto. Oggi gli avvisi
        partono su Telegram e per email. Se lasci solo un numero di telefono,
        non riusciamo ancora a scriverti.
      </>
    ),
  },
  {
    titolo: 'Dove è successo',
    testo: (
      <>
        Indichi un luogo con parole tue: una via, una piazza, una struttura. Ci
        dici anche comune e quartiere, se li conosci. La banca dati può
        conservare un punto con precisione piena. Quel punto non esce mai così.
        In pagina e nei dati aperti è arrotondato a circa 300 metri.
      </>
    ),
  },
  {
    titolo: 'I messaggi vocali',
    testo: (
      <>
        Se mandi un vocale al bot, conserviamo il file audio. La tua voce è un
        dato biometrico: ti identifica anche senza il tuo nome. Per questo
        l’audio sta in un archivio privato e non è scaricabile da nessuna pagina.
        Nel percorso civico entra solo la trascrizione scritta, mai il file. Un
        dato come questo richiede un consenso esplicito. Oggi il servizio non te
        lo chiede ancora.
      </>
    ),
  },
  {
    titolo: 'Le fotografie',
    testo: (
      <>
        Se mandi una foto, conserviamo il file nello stesso archivio privato. Una
        foto scattata in strada può contenere persone che non hanno mai scritto a
        VOCE. Può contenere targhe, numeri civici e insegne di negozi. Per questo
        non pubblichiamo mai l’originale: in pagina va solo una descrizione
        scritta del problema. Le persone inquadrate non vengono descritte.
      </>
    ),
  },
  {
    titolo: 'Se firmi un atto',
    testo: (
      <>
        Registriamo che hai firmato quell’atto e quando. Salviamo anche un codice
        calcolato dal tuo indirizzo internet. Serve a dimostrare che le firme non
        arrivano tutte dallo stesso computer. L’indirizzo in chiaro non viene
        conservato e dal codice non si torna indietro.
      </>
    ),
  },
  {
    titolo: 'Dati tecnici',
    testo: (
      <>
        Non usiamo cookie di profilazione e non ti seguiamo su altri siti. Un
        cookie tecnico esiste solo per chi entra nel pannello di
        amministrazione. I registri tecnici del server contengono identificativi
        di segnalazioni e gruppi, non il tuo racconto.
      </>
    ),
  },
]

/** Cosa succede al testo prima che qualcuno possa leggerlo. */
const TRATTAMENTI: { titolo: string; testo: string }[] = [
  {
    titolo: 'Il testo viene riscritto senza chi lo identifica',
    testo:
      'Nomi, recapiti, numeri civici, targhe e codici fiscali vengono tolti. I controlli sono due in fila: regole fisse e un secondo modello che rilegge. Solo quella versione può comparire in pagina o dentro un atto.',
  },
  {
    titolo: 'Le posizioni sono arrotondate',
    testo:
      'Ogni coordinata esce dal server arrotondata a circa 300 metri. Chi guarda vede una zona, non la tua porta.',
  },
  {
    titolo: 'Un gruppo diventa pubblico solo in tre',
    testo:
      'Sotto le tre persone diverse, un gruppo resta invisibile. In una via corta, mostrarlo prima equivarrebbe a indicare chi ha parlato.',
  },
  {
    titolo: 'I contenuti offensivi vengono messi da parte',
    testo:
      'Un controllo automatico segnala insulti e minacce. Quella segnalazione esce dal gruppo e aspetta una persona. Non viene cancellata, e chi rivede lascia il proprio nome.',
  },
  {
    titolo: 'Nessun atto parte senza revisione umana',
    testo:
      'Le bozze le prepara l’intelligenza artificiale. Una persona le rilegge, le corregge e le firma. È un vincolo della banca dati, non una buona intenzione.',
  },
]

/** I destinatari veri, quelli che il codice chiama davvero. */
const DESTINATARI: { nome: string; ruolo: string; dove: ReactNode }[] = [
  {
    nome: 'OpenAI',
    ruolo:
      'Smista le segnalazioni, trascrive i vocali, descrive le foto e scrive le bozze degli atti.',
    dove: <>Tratta i dati anche fuori dall’Unione europea.</>,
  },
  {
    nome: 'Supabase',
    ruolo: 'Ospita la banca dati e l’archivio privato di vocali e foto.',
    dove: (
      <>
        La regione del progetto va indicata:{' '}
        <DaCompletare>regione del progetto Supabase</DaCompletare>
      </>
    ),
  },
  {
    nome: 'Vercel',
    ruolo: 'Esegue il sito e i lavori automatici programmati.',
    dove: (
      <>
        Le regioni di esecuzione vanno indicate:{' '}
        <DaCompletare>regioni di esecuzione su Vercel</DaCompletare>
      </>
    ),
  },
  {
    nome: 'Telegram',
    ruolo: 'Consegna i messaggi se scrivi al bot, e i nostri avvisi a te.',
    dove: <>Vede il tuo messaggio prima di noi. Tratta i dati fuori dall’Unione europea.</>,
  },
  {
    nome: 'Il fornitore di posta elettronica',
    ruolo: 'Recapita gli avvisi via email a chi segnala dal sito.',
    dove: (
      <>
        Va indicato quando il canale viene configurato:{' '}
        <DaCompletare>nome e sede del fornitore di posta</DaCompletare>
      </>
    ),
  },
]

/** I diritti, con la parola che li rende comprensibili. */
const DIRITTI: { titolo: string; testo: string }[] = [
  {
    titolo: 'Sapere cosa abbiamo su di te',
    testo: 'Puoi chiedere copia dei tuoi dati e sapere da dove arrivano.',
  },
  {
    titolo: 'Correggere quello che è sbagliato',
    testo: 'Se un dato è inesatto o incompleto, lo correggiamo.',
  },
  {
    titolo: 'Farti cancellare',
    testo:
      'Cancelliamo il tuo profilo, i tuoi vocali, le tue foto e le tue firme. Se la tua segnalazione è già dentro un atto inviato, il testo resta in forma anonima. Il legame con te viene reciso.',
  },
  {
    titolo: 'Limitare o opporti al trattamento',
    testo: 'Puoi chiederci di fermarci, in tutto o su una singola segnalazione.',
  },
  {
    titolo: 'Portare via i tuoi dati',
    testo: 'Te li consegniamo in un formato leggibile da un altro servizio.',
  },
  {
    titolo: 'Cambiare idea',
    testo:
      'Se il trattamento si fonda sul tuo consenso, puoi revocarlo quando vuoi. Quello che è già stato fatto resta valido.',
  },
]

/** PLAN2 §7, riga per riga: i poteri che VOCE rifiuta di avere. */
const CONFINI: string[] = [
  'Non diamo un punteggio alle persone e non classifichiamo i cittadini.',
  'Non passiamo niente alle forze dell’ordine.',
  'Non usiamo le tue parole per addestrare modelli.',
  'Non vendiamo i tuoi dati e non li cediamo a chi fa pubblicità.',
  'Non pubblichiamo mai il tuo testo grezzo, i tuoi vocali o le tue foto.',
  'Non usiamo il riconoscimento facciale, nemmeno per oscurare i volti.',
]

export default function PrivacyPage() {
  return (
    <>
      <Breadcrumb
        voci={[{ etichetta: 'Home', href: '/' }, { etichetta: 'Come trattiamo i tuoi dati' }]}
      />

      <h1 className="text-h1">Come trattiamo i tuoi dati</h1>

      <CalloutAvviso
        tono="attenzione"
        titolo="Questa informativa non è ancora completa"
        className="mt-6 max-w-2xl"
      >
        <p>
          Mancano il titolare del trattamento, i suoi recapiti e la base
          giuridica. Qui sotto li riconosci: sono scritti come{' '}
          <span className="font-semibold">[DA COMPLETARE]</span>.
        </p>
        <p className="mt-2">
          Finché restano vuoti, VOCE non è aperto a segnalazioni reali. Non
          scrivere qui fatti che riguardano davvero te o altre persone.
        </p>
      </CalloutAvviso>

      <p className="mt-6 max-w-2xl text-body text-ink-muted">
        Questa pagina dice quali dati raccogliamo, cosa ne facciamo e come li
        controlli. È scritta in italiano semplice, come chiede l’art. 12 del
        GDPR. Ogni frase corrisponde a quello che il codice fa davvero.
      </p>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-12 border-t border-surface-strong pt-10" aria-labelledby="in-breve">
        <h2 id="in-breve" className="text-h2">
          In breve
        </h2>
        <ul className="mt-4 max-w-2xl list-disc space-y-2 pl-5 text-body text-ink-muted">
          <li>In pagina va solo una versione del tuo testo senza nomi e recapiti.</li>
          <li>Le posizioni escono arrotondate a circa 300 metri.</li>
          <li>Un gruppo diventa visibile solo con almeno tre cittadini diversi.</li>
          <li>Vocali e foto restano in un archivio privato: non li pubblichiamo mai.</li>
          <li>Oggi nessun dato viene cancellato in automatico dopo un periodo.</li>
          <li>Puoi chiedere di vedere, correggere o cancellare quello che abbiamo.</li>
        </ul>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-12 border-t border-surface-strong pt-10" aria-labelledby="chi-tratta">
        <h2 id="chi-tratta" className="text-h2">
          Chi tratta i tuoi dati
        </h2>
        <p className="mt-4 max-w-2xl text-body text-ink-muted">
          Il titolare del trattamento è chi decide perché e come si usano i tuoi
          dati. Questi valori non stanno nel codice e non li inventiamo. Un
          titolare inventato sarebbe una dichiarazione falsa a chi si fida.
        </p>

        <dl className="mt-6 max-w-2xl space-y-5 text-body">
          <div>
            <dt className="font-semibold text-ink">Titolare del trattamento</dt>
            <dd className="mt-1 text-ink-muted">
              <DaCompletare>
                nome, forma giuridica, sede legale e partita IVA del titolare
              </DaCompletare>
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Come ci scrivi per i tuoi diritti</dt>
            <dd className="mt-1 text-ink-muted">
              <DaCompletare>
                indirizzo email e indirizzo postale per l’esercizio dei diritti
              </DaCompletare>
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">
              Responsabile della protezione dei dati
            </dt>
            <dd className="mt-1 text-ink-muted">
              <DaCompletare>
                nominativo e contatto, se il titolare lo ha nominato
              </DaCompletare>
            </dd>
          </div>
        </dl>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-12 border-t border-surface-strong pt-10" aria-labelledby="quali-dati">
        <h2 id="quali-dati" className="text-h2">
          Quali dati raccogliamo
        </h2>
        <p className="mt-4 max-w-2xl text-body text-ink-muted">
          Raccogliamo solo quello che serve a mettere insieme la tua
          segnalazione. Serve a unirla a quelle di chi vive vicino a te.
        </p>

        <ul className="mt-6 grid gap-6 sm:grid-cols-2">
          {DATI.map((dato) => (
            <CardIstituzionale as="li" key={dato.titolo}>
              <h3 className="text-h4">{dato.titolo}</h3>
              <p className="mt-2 text-body text-ink-muted">{dato.testo}</p>
            </CardIstituzionale>
          ))}
        </ul>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-12 border-t border-surface-strong pt-10" aria-labelledby="cosa-facciamo">
        <h2 id="cosa-facciamo" className="text-h2">
          Cosa ne facciamo
        </h2>
        <p className="mt-4 max-w-2xl text-body text-ink-muted">
          Il tuo racconto serve a una cosa sola. Capire se altre persone hanno
          lo stesso problema. Da lì nascono i gruppi e gli atti civici.
        </p>

        <ul className="mt-6 max-w-2xl space-y-5">
          {TRATTAMENTI.map((voce) => (
            <li key={voce.titolo} className="border-l-4 border-surface-strong pl-4">
              <h3 className="text-h4">{voce.titolo}</h3>
              <p className="mt-1 text-body text-ink-muted">{voce.testo}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-12 border-t border-surface-strong pt-10" aria-labelledby="base-giuridica">
        <h2 id="base-giuridica" className="text-h2">
          Perché possiamo trattarli
        </h2>
        <div className="mt-4 max-w-2xl space-y-3 text-body text-ink-muted">
          <p>
            La base giuridica è la ragione che ci permette di usare i tuoi dati.
            Va confermata da un parere legale prima di aprire il servizio.
          </p>
          <p>
            <DaCompletare>
              base giuridica confermata da un parere legale, art. 6 e art. 9 GDPR
            </DaCompletare>
          </p>
          <p>
            VOCE è un soggetto privato. L’interesse pubblico dell’art. 6(1)(e) da
            solo non regge. Per la fase di prova la strada ragionevole è il tuo
            consenso, previsto dall’art. 6(1)(a).
          </p>
          <p>
            Per i dati sulla salute serve un consenso esplicito e separato,
            previsto dall’art. 9(2)(a). In una segnalazione sul pronto soccorso
            quei dati arrivano di sicuro. Lo stesso vale per i messaggi vocali,
            che sono dati biometrici.
          </p>
          <p>
            Oggi il modulo di segnalazione non chiede questo consenso separato. È
            una delle cose da aggiungere prima di accogliere segnalazioni vere.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-12 border-t border-surface-strong pt-10" aria-labelledby="destinatari">
        <h2 id="destinatari" className="text-h2">
          A chi li mandiamo
        </h2>
        <p className="mt-4 max-w-2xl text-body text-ink-muted">
          Per funzionare, VOCE si appoggia a questi fornitori. Sono tutti quelli
          che il codice usa davvero: nessuno in più.
        </p>

        <ul className="mt-6 max-w-2xl space-y-5">
          {DESTINATARI.map((destinatario) => (
            <li key={destinatario.nome} className="border-l-4 border-surface-strong pl-4">
              <h3 className="text-h4">{destinatario.nome}</h3>
              <p className="mt-1 text-body text-ink-muted">{destinatario.ruolo}</p>
              <p className="mt-1 text-body text-ink-muted">{destinatario.dove}</p>
            </li>
          ))}
        </ul>

        <div className="mt-6 max-w-2xl space-y-3 text-body text-ink-muted">
          <p>
            Alcuni di questi fornitori trattano i dati fuori dall’Unione europea.
            Le garanzie contrattuali per quei trasferimenti vanno verificate e
            allegate qui.
          </p>
          <p>
            <DaCompletare>
              garanzie per i trasferimenti fuori dall’Unione europea, art. 46 GDPR
            </DaCompletare>
          </p>
          <p>
            Fuori da questo elenco non condividiamo niente con nessuno. Non
            vendiamo i tuoi dati.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-12 border-t border-surface-strong pt-10" aria-labelledby="per-quanto">
        <h2 id="per-quanto" className="text-h2">
          Per quanto tempo li teniamo
        </h2>
        <div className="mt-4 max-w-2xl space-y-3 text-body text-ink-muted">
          <p>
            Va detto com’è: oggi il codice non cancella niente dopo un periodo di
            tempo. Non esiste nessuna riga che applichi un termine di
            conservazione.
          </p>
          <p>
            Preferiamo scriverlo piuttosto che dichiarare un termine che nessuno
            rispetta. Il termine va deciso e poi scritto nel codice, non solo in
            questa pagina.
          </p>
          <p>
            <DaCompletare>
              tempi di conservazione per segnalazioni, vocali, foto e recapiti
            </DaCompletare>
          </p>
          <p>
            Quello che invece funziona è la cancellazione su richiesta. Quando
            cancelliamo un profilo, i file finiscono in una coda. Un lavoro
            automatico li rimuove dall’archivio. Se la tua segnalazione è già
            confluita in un atto inviato, il testo resta in forma anonima. Un
            atto già protocollato non si riscrive.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-12 border-t border-surface-strong pt-10" aria-labelledby="diritti">
        <h2 id="diritti" className="text-h2">
          I tuoi diritti
        </h2>
        <p className="mt-4 max-w-2xl text-body text-ink-muted">
          Sono i diritti che ti danno gli articoli dal 15 al 22 del GDPR. Valgono
          sempre, anche se hai scritto dal bot senza account.
        </p>

        <ul className="mt-6 grid gap-6 sm:grid-cols-2">
          {DIRITTI.map((diritto) => (
            <CardIstituzionale as="li" key={diritto.titolo}>
              <h3 className="text-h4">{diritto.titolo}</h3>
              <p className="mt-2 text-body text-ink-muted">{diritto.testo}</p>
            </CardIstituzionale>
          ))}
        </ul>

        <h3 className="mt-8 text-h3">Come si esercitano</h3>
        <div className="mt-3 max-w-2xl space-y-3 text-body text-ink-muted">
          <p>
            Scrivi all’indirizzo del titolare, quello indicato più sopra come{' '}
            <span className="font-semibold">[DA COMPLETARE]</span>. Racconta cosa
            vuoi ottenere: non serve citare articoli di legge.
          </p>
          <p>
            Se hai segnalato dal sito, indica l’email o il numero che hai usato.
            Se hai scritto al bot, dillo: ci serve per ritrovare i tuoi messaggi.
          </p>
          <p>
            La legge dà al titolare un mese per risponderti. Oggi nel sito non
            esiste un pulsante per cancellarti da solo. La cancellazione la
            esegue una persona sulla banca dati.
          </p>
          <p>
            Se pensi che i tuoi dati siano trattati male, puoi fare un reclamo.
            Si presenta al Garante per la protezione dei dati personali. Il suo
            sito è{' '}
            <a
              href="https://www.garanteprivacy.it"
              className="font-semibold text-primary-600 underline underline-offset-4"
            >
              garanteprivacy.it
            </a>
            .
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-12 border-t border-surface-strong pt-10" aria-labelledby="cosa-non-facciamo">
        <h2 id="cosa-non-facciamo" className="text-h2">
          Cosa non facciamo
        </h2>
        <p className="mt-4 max-w-2xl text-body text-ink-muted">
          Sono tutte cose tecnicamente possibili. Sono state scartate apposta.
        </p>
        <ul className="mt-4 max-w-2xl list-disc space-y-2 pl-5 text-body text-ink-muted">
          {CONFINI.map((confine) => (
            <li key={confine}>{confine}</li>
          ))}
        </ul>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-12 border-t border-surface-strong pt-10" aria-labelledby="ruolo-ai">
        <h2 id="ruolo-ai" className="text-h2">
          Dove entra l’intelligenza artificiale
        </h2>
        <div className="mt-4 max-w-2xl space-y-3 text-body text-ink-muted">
          <p>
            Un modello legge la tua segnalazione e ne ricava categoria, urgenza e
            luogo. Un secondo modello rilegge il testo e toglie ciò che è
            sfuggito. Un altro trascrive i vocali e descrive le foto.
          </p>
          <p>
            Le bozze degli atti sono scritte con l’aiuto dell’intelligenza
            artificiale e revisionate da una persona. Ogni atto porta questa
            etichetta, in pagina e nel documento.
          </p>
          <p>
            Nessuna decisione automatica produce effetti giuridici su di te. Le
            macchine preparano, le persone firmano.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-12 border-t border-surface-strong pt-10" aria-labelledby="aggiornamenti">
        <h2 id="aggiornamenti" className="text-h2">
          Aggiornamenti di questa pagina
        </h2>
        <div className="mt-4 max-w-2xl space-y-3 text-body text-ink-muted">
          <p>
            Ultimo aggiornamento: 6 agosto 2026. Quando cambiamo qualcosa di
            importante, lo scriviamo qui.
          </p>
          <p>
            Il codice di VOCE è pubblico: puoi controllare che questa pagina dica
            il vero. Se vuoi capire come funziona il servizio, parti da{' '}
            <Link
              href="/cosa-e"
              className="font-semibold text-primary-600 underline underline-offset-4"
            >
              cosa è VOCE
            </Link>
            .
          </p>
        </div>
      </section>
    </>
  )
}
