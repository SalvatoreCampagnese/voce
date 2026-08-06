/**
 * Proposta di mozione da depositare in consiglio comunale.
 *
 * Differenza sostanziale rispetto agli altri atti di questa cartella: la mozione
 * non la presentano i cittadini, la presenta e la firma un consigliere comunale
 * (art. 43, comma 1, TUEL). Il testo che generiamo serve a lui: deve poter essere
 * depositato con modifiche minime — dati anagrafici, gruppo consiliare, estremi
 * del regolamento del proprio consiglio.
 *
 * Tre scelte stanno alla base di questo file, e sono la risposta ad altrettanti
 * modi in cui questo atto può fare danno:
 *
 * 1. QUELLO CHE ESCE DA QUI È UNA PROPOSTA. Nessun consigliere l'ha depositata,
 *    nessuna seduta l'ha votata. L'atto lo dice nella prima riga, sempre: far
 *    credere a chi sostiene la proposta che il Consiglio abbia già impegnato il
 *    Sindaco è una promessa di esito che nessuno può mantenere.
 * 2. LE PERSONE NON DEVONO ESSERE RICONOSCIBILI. Le date del materiale sono
 *    date di RICEZIONE della segnalazione, non date del fatto, e il prompt
 *    impone di scriverle come tali. Sintomi, età, rapporti di parentela e
 *    numeri civici non entrano nell'atto: una condizione di salute più una data
 *    puntuale più una struttura sono, insieme, una riga sola nel registro di
 *    quella struttura — e da lì si arriva alla persona che ha segnalato.
 * 3. I CITTADINI NON FIRMANO QUESTO ATTO. L'elenco di chi sostiene la proposta
 *    resta presso VOCE e non viene trasmesso: gli atti del Comune sono
 *    accessibili a chiunque (art. 10, comma 1, TUEL), incluso l'ente di cui
 *    l'atto si occupa.
 *
 * Il regolamento del consiglio comunale cambia da comune a comune: numero degli
 * articoli, termini di deposito, firme minime, tempi di iscrizione all'ordine del
 * giorno. Il TUEL si limita a dire che il funzionamento del consiglio è
 * disciplinato da quel regolamento (art. 38, comma 2). Per questo il modello non
 * contiene nessuna regola procedurale: contiene segnaposto espliciti. Un articolo
 * di regolamento inventato fa dichiarare inammissibile la mozione, e a rimetterci
 * è il consigliere che l'ha depositata.
 */

import { CATEGORY_LABELS } from '@voce/db'
import {
  DISCLAIMER_AI,
  REGOLE_COMUNI,
  type ContestoAtto,
  type ModelloAtto,
  type RiferimentoNormativo,
  type SegnalazioneCitabile,
} from './tipi'

/**
 * Un riferimento verificato più le condizioni alle quali può comparire
 * nell'atto.
 *
 * La separazione fra `reference` e `usage` non è estetica: `dossier.ts` stampa
 * in calce a ogni atto pubblicato i campi `citazione` e `contenuto` di tutti i
 * riferimenti del modello. Tutto ciò che scriviamo lì finisce nel documento
 * depositato in Consiglio e nel PDF. Una direttiva rivolta al modello
 * («non citarlo se…») stampata sotto la voce «Riferimenti normativi» è la prova
 * visibile che l'atto non è stato riletto da nessuno. Quindi: in `contenuto`
 * solo che cosa stabilisce la norma, in `usage` tutto il resto.
 */
interface UsableReference {
  reference: RiferimentoNormativo
  /** Quando e in che forma il riferimento può entrare nell'atto. Mai stampato. */
  usage: string
}

/**
 * Riferimenti normativi verificati uno per uno sul testo vigente pubblicato da
 * Normattiva (Istituto Poligrafico e Zecca dello Stato) il 4 agosto 2026.
 * L'URL in `fonte` è quello effettivamente consultato.
 *
 * Due criteri di ammissione, oltre alla verifica:
 *
 * - SOLO NORME GENERALI. `dossier.ts` stampa l'elenco integrale in calce a
 *   qualunque mozione, senza sapere di che materia parli e senza sapere quali
 *   norme il modello abbia davvero citato. Una norma di settore finirebbe
 *   quindi anche sotto una mozione sulle buche stradali. Finché quel filtro non
 *   esiste, qui entrano solo norme che valgono per qualsiasi materia.
 * - SOLO NORME CHE SERVONO A QUESTO ATTO. L'art. 43, comma 3, TUEL (termine di
 *   30 giorni per le interrogazioni e per il sindacato ispettivo) e l'art. 8,
 *   comma 3, TUEL (procedure statutarie per istanze e petizioni) sono esatti ma
 *   non riguardano la mozione: sono stati tolti perché, stampati in calce,
 *   inducono a leggere nella mozione un termine di risposta e un fondamento
 *   partecipativo che non ha.
 */
const REFERENCE_CATALOG: readonly UsableReference[] = [
  {
    reference: {
      citazione: 'art. 42, comma 1, D.Lgs. 18 agosto 2000, n. 267 (TUEL)',
      contenuto:
        "Il consiglio è l'organo di indirizzo e di controllo politico-amministrativo.",
      fonte:
        'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2000-08-18;267~art42',
    },
    usage:
      "nel CONSIDERATO CHE, una sola volta, per fondare la competenza del consiglio ad " +
      'adottare un atto di indirizzo. Non usarlo per attribuire al consiglio poteri di ' +
      'gestione o di organizzazione dei servizi: quelli non sono suoi.',
  },
  {
    reference: {
      citazione: 'art. 43, comma 1, D.Lgs. 18 agosto 2000, n. 267 (TUEL)',
      contenuto:
        'I consiglieri comunali e provinciali hanno diritto di iniziativa su ogni ' +
        'questione sottoposta alla deliberazione del consiglio. Hanno inoltre il diritto ' +
        'di chiedere la convocazione del consiglio secondo le modalità dettate ' +
        "dall'articolo 39, comma 2, e di presentare interrogazioni e mozioni.",
      fonte:
        'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2000-08-18;267~art43',
    },
    usage:
      'nella formula di presentazione, come base del deposito della mozione da parte del ' +
      'consigliere proponente. È il solo riferimento che legittima chi presenta l\'atto.',
  },
  {
    reference: {
      citazione: 'art. 43, comma 2, D.Lgs. 18 agosto 2000, n. 267 (TUEL)',
      contenuto:
        'I consiglieri comunali e provinciali hanno diritto di ottenere dagli uffici, ' +
        'rispettivamente, del comune e della provincia, nonché dalle loro aziende ed enti ' +
        'dipendenti, tutte le notizie e le informazioni in loro possesso, utili ' +
        "all'espletamento del proprio mandato. Essi sono tenuti al segreto nei casi " +
        'specificamente determinati dalla legge.',
      fonte:
        'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2000-08-18;267~art43',
    },
    usage:
      'SOLO per i dati che il Comune, o una sua azienda o ente dipendente, già detiene. ' +
      "Un'azienda sanitaria, un'azienda regionale di trasporto o un ente regionale NON " +
      'sono enti dipendenti dal comune: per i loro dati questo comma non serve e citarlo ' +
      'sarebbe fuori bersaglio. Serve a distinguere, nella parte dispositiva, ciò che il ' +
      'consigliere può già chiedere agli uffici comunali da ciò che richiede una ' +
      'richiesta formale a un ente terzo.',
  },
  {
    reference: {
      citazione: 'art. 38, comma 2, D.Lgs. 18 agosto 2000, n. 267 (TUEL)',
      contenuto:
        'Il funzionamento dei consigli, nel quadro dei principi stabiliti dallo statuto, ' +
        'è disciplinato dal regolamento, approvato a maggioranza assoluta, che prevede, ' +
        'in particolare, le modalità per la convocazione e per la presentazione e la ' +
        'discussione delle proposte.',
      fonte:
        'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2000-08-18;267~art38',
    },
    usage:
      'una sola volta, per giustificare il segnaposto sull\'articolo del regolamento ' +
      'consiliare. Non ricavarne alcuna regola procedurale concreta: termini di deposito, ' +
      'firme minime e numerazione degli articoli non ti sono stati dati e cambiano da ' +
      'comune a comune.',
  },
  {
    reference: {
      citazione: 'art. 39, commi 1 e 3, D.Lgs. 18 agosto 2000, n. 267 (TUEL)',
      contenuto:
        'I consigli comunali dei comuni con popolazione superiore a 15.000 abitanti sono ' +
        'presieduti da un presidente eletto tra i consiglieri nella prima seduta del ' +
        'consiglio, cui sono attribuiti, tra gli altri, i poteri di convocazione e di ' +
        'direzione dei lavori; nei comuni con popolazione inferiore ai 15.000 abitanti lo ' +
        'statuto può prevedere la figura del presidente del consiglio e, in mancanza, il ' +
        'consiglio è presieduto dal sindaco, che provvede anche alla convocazione del ' +
        'consiglio salvo differente previsione statutaria.',
      fonte:
        'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2000-08-18;267~art39',
    },
    usage:
      "serve a scrivere l'intestazione, non a essere citato nel corpo dell'atto. Non sai " +
      'quanti abitanti abbia il comune né che cosa preveda il suo statuto: per questo ' +
      "l'intestazione porta sempre l'alternativa e il segnaposto di verifica.",
  },
  {
    reference: {
      citazione: 'art. 48, comma 2, D.Lgs. 18 agosto 2000, n. 267 (TUEL)',
      contenuto:
        'La giunta collabora con il sindaco e con il presidente della provincia ' +
        "nell'attuazione degli indirizzi generali del consiglio; riferisce annualmente al " +
        'consiglio sulla propria attività e svolge attività propositive e di impulso nei ' +
        'confronti dello stesso.',
      fonte:
        'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2000-08-18;267~art48',
    },
    usage:
      'nel CONSIDERATO CHE, per spiegare perché gli impegni si rivolgono anche alla ' +
      'giunta e perché la giunta deve riferire al consiglio.',
  },
  {
    reference: {
      citazione: 'art. 50, commi 1 e 2, D.Lgs. 18 agosto 2000, n. 267 (TUEL)',
      contenuto:
        "Il sindaco e il presidente della provincia sono gli organi responsabili " +
        "dell'amministrazione del comune e della provincia; rappresentano l'ente, " +
        'convocano e presiedono la giunta, nonché il consiglio quando non è previsto il ' +
        'presidente del consiglio, e sovrintendono al funzionamento dei servizi e degli ' +
        "uffici e all'esecuzione degli atti.",
      fonte:
        'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2000-08-18;267~art50',
    },
    usage:
      "per indicare il sindaco come destinatario degli impegni di sovrintendenza e di " +
      'esecuzione. Il comma 2 dice anche chi presiede il consiglio quando il presidente ' +
      "del consiglio non è previsto: è coerente con l'alternativa dell'intestazione.",
  },
  {
    reference: {
      citazione: 'art. 10, comma 1, D.Lgs. 18 agosto 2000, n. 267 (TUEL)',
      contenuto:
        "Tutti gli atti dell'amministrazione comunale e provinciale sono pubblici, ad " +
        'eccezione di quelli riservati per espressa indicazione di legge o per effetto di ' +
        'una temporanea e motivata dichiarazione del sindaco o del presidente della ' +
        "provincia che ne vieti l'esibizione, conformemente a quanto previsto dal " +
        'regolamento, in quanto la loro diffusione possa pregiudicare il diritto alla ' +
        'riservatezza delle persone, dei gruppi o delle imprese.',
      fonte:
        'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2000-08-18;267~art10',
    },
    usage:
      "SOLO per affermare che gli atti del comune sono ACCESSIBILI a chi li chiede. Non " +
      'usarlo per fondare un obbligo di pubblicazione sul sito istituzionale: la norma ' +
      "non lo prevede, e il comma 2 rinvia al regolamento comunale per l'accesso. Tienine " +
      "conto anche mentre scrivi: ciò che entra in questo atto diventa accessibile a " +
      "chiunque, compreso l'ente di cui l'atto si occupa.",
  },
  {
    reference: {
      citazione: 'art. 5, comma 2, D.Lgs. 14 marzo 2013, n. 33',
      contenuto:
        'Chiunque ha diritto di accedere ai dati e ai documenti detenuti dalle pubbliche ' +
        'amministrazioni, ulteriori rispetto a quelli oggetto di pubblicazione ' +
        'obbligatoria, nel rispetto dei limiti relativi alla tutela di interessi ' +
        "giuridicamente rilevanti previsti dall'articolo 5-bis.",
      fonte:
        'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2013-03-14;33~art5',
    },
    usage:
      'nella parte dispositiva, per chiudere la catena quando un impegno chiede dati a un ' +
      "ente terzo: è la via che resta se l'ente non risponde. Non presentarlo come un " +
      "obbligo dell'ente di rispondere alla mozione.",
  },
  {
    reference: {
      citazione: 'art. 5, comma 6, D.Lgs. 14 marzo 2013, n. 33',
      contenuto:
        'Il procedimento di accesso civico deve concludersi con provvedimento espresso e ' +
        'motivato nel termine di trenta giorni dalla presentazione dell\'istanza, con ' +
        'comunicazione al richiedente e agli eventuali controinteressati; il rifiuto, il ' +
        'differimento e la limitazione dell\'accesso devono essere motivati con ' +
        "riferimento ai casi e ai limiti stabiliti dall'articolo 5-bis.",
      fonte:
        'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2013-03-14;33~art5',
    },
    usage:
      'solo insieme al comma 2 e solo riferito al procedimento di accesso civico. Il ' +
      'termine di trenta giorni è quello di QUEL procedimento: non è un termine di ' +
      'risposta alla mozione né alla richiesta informale rivolta a un ente.',
  },
  {
    reference: {
      citazione: 'art. 5, comma 7, D.Lgs. 14 marzo 2013, n. 33',
      contenuto:
        "Nei casi di diniego totale o parziale dell'accesso o di mancata risposta entro il " +
        'termine di trenta giorni, il richiedente può presentare richiesta di riesame al ' +
        'responsabile della prevenzione della corruzione e della trasparenza, che decide ' +
        'con provvedimento motivato entro il termine di venti giorni.',
      fonte:
        'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2013-03-14;33~art5',
    },
    usage:
      'come passo eventuale e successivo al comma 2, mai come minaccia e mai in prima ' +
      'battuta. Si scrive «ove necessario», non «in ogni caso».',
  },
  {
    reference: {
      citazione: 'art. 7-bis, comma 3, D.Lgs. 14 marzo 2013, n. 33',
      contenuto:
        'Le pubbliche amministrazioni possono disporre la pubblicazione nel proprio sito ' +
        'istituzionale di dati, informazioni e documenti che non hanno l\'obbligo di ' +
        'pubblicare ai sensi del presente decreto o sulla base di specifica previsione di ' +
        "legge o regolamento, nel rispetto dei limiti indicati dall'articolo 5-bis, " +
        'procedendo alla indicazione in forma anonima dei dati personali eventualmente ' +
        'presenti.',
      fonte:
        'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2013-03-14;33~art7bis',
    },
    usage:
      "per l'impegno di pubblicare sul sito istituzionale le richieste inviate e i " +
      'riscontri ricevuti. La norma impone di indicare in forma anonima i dati personali ' +
      "eventualmente presenti: l'impegno deve dirlo, altrimenti chiede una pubblicazione " +
      'che la norma non consente.',
  },
]

const RIFERIMENTI: RiferimentoNormativo[] = REFERENCE_CATALOG.map((e) => e.reference)

/**
 * Avviso obbligatorio in testa all'atto.
 *
 * Trenta cittadini possono sostenere questa proposta prima che un solo
 * consigliere l'abbia vista. Senza questa riga il documento afferma che il
 * Consiglio impegna il Sindaco, e chi lo sostiene lo racconta come un impegno
 * assunto: quando non accade nulla — ipotesi del tutto normale, perché nessuno
 * è obbligato ad adottarla — la delusione ricade su chi ci ha messo la faccia
 * nel proprio quartiere.
 */
const AVVISO_PROPOSTA =
  'Proposta di mozione. Non è stata depositata, discussa né approvata: il ' +
  "deposito dipende dall'adozione da parte di un consigliere comunale e " +
  "l'efficacia dal voto del Consiglio comunale."

/**
 * Toglie da un luogo tutto ciò che ha una cifra dentro.
 *
 * `SegnalazioneCitabile.luogo` arriva da `reports.location_hint`, che il triage
 * compila riportando il luogo COSÌ COM'È SCRITTO dal cittadino, numero civico
 * compreso: l'anonimizzazione dei civici vale per `anon_text`, non per quel
 * campo. «Davanti a casa mia, in via X 15» diventerebbe l'indirizzo di casa di
 * una persona dentro un atto depositato in Consiglio e pubblicato dal Comune.
 * In un quartiere, quell'indirizzo è la persona.
 *
 * Qui il campo viene ripulito prima di essere mostrato al modello. La pulizia è
 * volutamente grossolana — toglie ogni cifra, quindi «via 4 Novembre» diventa
 * «via Novembre» — perché in questa direzione l'errore costa poco e nell'altra
 * costa una persona. Se dopo la pulizia non resta abbastanza testo, il luogo
 * viene trattato come non indicato.
 */
function sanitizePlace(luogo: string | null): string | null {
  if (!luogo) return null
  const pulito = luogo
    .replace(/\bn(?:\.|um(?:ero)?\.?)?\s*\d+/gi, ' ')
    .replace(/\d+[a-z]?/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s,;:.-]+$/g, '')
    .trim()
  return pulito.length >= 3 ? pulito : null
}

/**
 * «[3] segnalazione ricevuta il 18 luglio 2026 — luogo indicato: pronto
 * soccorso cittadino — testo: …»
 *
 * La data è etichettata come data di ricezione già qui, dove il modello la
 * legge: è l'unico modo perché non finisca nell'atto come data del fatto.
 */
function formatCitation(c: SegnalazioneCitabile): string {
  const luogo = sanitizePlace(c.luogo)
  return (
    `[${c.indice}] segnalazione ricevuta il ${c.data} — luogo indicato: ` +
    `${luogo ?? 'nessuno'} — testo: ${c.testo}`
  )
}

function formatCitations(citazioni: SegnalazioneCitabile[]): string {
  return citazioni.map(formatCitation).join('\n')
}

/** L'elenco delle norme citabili con accanto le condizioni d'uso. */
function formatReferences(): string {
  return REFERENCE_CATALOG.map(
    (e) => `- ${e.reference.citazione} — ${e.reference.contenuto}\n  Uso ammesso: ${e.usage}`,
  ).join('\n')
}

const SYSTEM_PROMPT = `${REGOLE_COMUNI}

===========================================================================
ATTO DA REDIGERE: PROPOSTA DI MOZIONE PER IL CONSIGLIO COMUNALE
===========================================================================

DEROGA ALLE REGOLE COMUNI
Le regole inderogabili qui sopra si chiudono chiedendo una sezione
«Segnalazioni richiamate» con date e luoghi. Per questo atto NON la scrivere:
la costruisce il sistema dopo di te. Se la scrivi anche tu, il documento
depositato contiene due elenchi con lo stesso titolo e numeri diversi, e si
contraddice da solo davanti al Consiglio. Tutto il resto delle regole comuni
resta valido.

A. CHE COSA STAI SCRIVENDO
La mozione non è un appello dei cittadini e non è una petizione: la deposita e
la firma un consigliere comunale, che ha diritto di iniziativa su ogni
questione sottoposta alla deliberazione del consiglio e di presentare mozioni.
Scrivi il testo perché quel consigliere possa depositarlo con modifiche minime:
i suoi dati, il gruppo consiliare, gli estremi del regolamento del suo
consiglio.
Quello che produci è una PROPOSTA: nessun consigliere l'ha ancora depositata,
nessuna seduta l'ha discussa, nessun voto l'ha approvata. Per questo la prima
riga dell'atto, prima di ogni altra cosa e senza eccezioni, è esattamente
questa, riportata parola per parola:

${AVVISO_PROPOSTA}

Il soggetto che parla è «Il/La sottoscritto/a … consigliere comunale», al
singolare. I cittadini che hanno segnalato compaiono soltanto come fonte dei
fatti: non parlano in prima persona e non firmano l'atto.

B. I CITTADINI NON SONO FIRMATARI DI QUESTO ATTO
Non scrivere, in nessuna forma e in nessun punto, un elenco di sottoscrittori,
di firmatari o di cittadini, né in calce né come allegato, e non annunciarne
uno. L'elenco delle persone che sostengono la proposta resta presso VOCE e non
viene trasmesso ad alcuna amministrazione.
Se serve dare conto del sostegno ricevuto si scrive soltanto un numero, con il
segnaposto [DA COMPLETARE: numero di cittadini che sostengono la proposta alla
data del deposito]: mai un nome, mai un allegato nominativo.
L'unica indicazione di firme ammessa riguarda i consiglieri, e va scritta
esattamente così: «Eventuali consiglieri co-firmatari: [DA COMPLETARE]».
La ragione sta nell'atto stesso: gli atti del Comune sono accessibili a
chiunque. Un elenco di nomi depositato in Consiglio arriva anche all'ente di
cui l'atto si occupa, e nessuna di quelle persone ha scelto di comparire in un
protocollo comunale.

C. LE DATE CHE VEDI SONO DATE DI RICEZIONE, NON DATE DEL FATTO
Ogni data del materiale è il giorno in cui la segnalazione è arrivata alla
piattaforma. Non è il giorno in cui il fatto è avvenuto: un cittadino può
raccontare oggi una cosa della settimana scorsa.
Forma obbligatoria: «la segnalazione ricevuta il 12 luglio 2026 riferisce
un'attesa di otto ore [1]».
Forma vietata: «otto ore il 12 luglio 2026 [1]», e qualunque altra frase che
collochi il fatto nella data.
Se scrivi la data come data del fatto, all'ente basta rispondere «quel giorno
non risulta nulla» per demolire tutto il resto dell'atto, e avrebbe ragione.
Il primo capoverso del PREMESSO CHE lo dice una volta in chiaro: le date
indicate sono quelle di ricezione delle segnalazioni.

D. PERSONE: CHE COSA NON PUÒ ENTRARE NELL'ATTO
Questo atto viene depositato, pubblicato e trasmesso anche all'ente di cui
parla. Chi lo legge non deve poter risalire a chi ha segnalato.
Sono vietati, in ogni punto del testo:
  - sintomi, diagnosi, condizioni di salute riferiti a una persona singola;
  - età, fasce d'età e rapporti di parentela riferiti a una persona singola
    («un minore», «una persona di 70 anni», «il figlio di», «la madre di»);
  - qualunque frase che associ una condizione personale a una data puntuale.
Si scrive: «una segnalazione riferisce un'attesa di otto ore [1]», e nient'altro.
Se la fragilità delle persone coinvolte è rilevante per l'atto, va aggregata e
priva di data: «più segnalazioni riferiscono attese di persone anziane [2][4]»,
in un capoverso che non contiene alcuna data.
Vietati anche i numeri civici e ogni indirizzo preciso: se un luogo del
materiale contenesse cifre, non riprodurle; scrivi la via o la struttura senza
il numero.
Nessun impegno può chiedere di trasmettere ad altri le date, i luoghi o i
dettagli delle singole segnalazioni: sarebbe consegnare all'ente criticato la
chiave per identificare le persone.

E. IL REGOLAMENTO CONSILIARE NON LO CONOSCI
Termini di deposito, firme minime, numerazione degli articoli, tempi di
iscrizione all'ordine del giorno cambiano da comune a comune. Non indovinarli.
Ogni volta che servirebbe una regola del regolamento o dello statuto, scrivi un
segnaposto [DA COMPLETARE: …] che dica esattamente cosa il consigliere deve
verificare. Un articolo di regolamento inventato fa dichiarare inammissibile la
mozione.

F. IL TITOLO E IL RIASSUNTO DEL GRUPPO NON SONO PROVA
Nel materiale trovi un titolo e un riassunto del gruppo di segnalazioni: sono
prodotti da un sistema automatico, sono costruiti anche su segnalazioni che non
puoi citare e non sono una fonte. Servono solo a farti capire di che argomento
si tratta. Non citarli, non ricavarne fatti, non usarli nell'oggetto, non
riprenderne le quantificazioni.

STRUTTURA OBBLIGATORIA (Markdown, in quest'ordine, nessuna sezione saltata)

1. Prima riga: l'avviso del punto A, parola per parola, da solo.

2. Intestazione al destinatario, righe brevi.
   Chi presiede il consiglio comunale non è lo stesso in tutti i comuni: nei
   comuni con più di 15.000 abitanti c'è un presidente del consiglio eletto fra
   i consiglieri; sotto quella soglia il consiglio è presieduto dal sindaco,
   salvo che lo statuto preveda il presidente. Non sai in quale caso ricada
   questo comune. Scrivi quindi:
   «Al Presidente del Consiglio comunale di [città], ovvero al Sindaco quale
   presidente del consiglio comunale»
   «[DA COMPLETARE: verificare se lo statuto del Comune di [città] prevede il
   presidente del consiglio; nei comuni fino a 15.000 abitanti il consiglio è
   presieduto dal sindaco salvo diversa previsione statutaria]»
   «e, per conoscenza, al Sindaco e alla Giunta comunale di [città]»
   Se il materiale ti dà un destinatario, riportalo tale e quale sotto queste
   righe, senza sostituirlo, senza integrarlo e senza togliere il segnaposto di
   verifica: il contatto potrebbe riferirsi a una carica diversa da quella che
   in quel comune presiede il consiglio.

3. «OGGETTO:» una riga sola, che dice il problema e il comune, e nient'altro.
   L'oggetto si costruisce sul dato più basso dimostrabile dalle segnalazioni
   richiamate, mai sul più alto e mai sul titolo del gruppo: se quattro
   segnalazioni riferiscono attese di sei ore e una di cinque, l'oggetto dice
   «attese pari o superiori a cinque ore». Un oggetto che dice più del corpo
   dell'atto si smentisce da solo entro la prima pagina.
   Nessun aggettivo, nessun punto esclamativo.

4. Formula di presentazione, in un unico capoverso:
   «Il/La sottoscritto/a [DA COMPLETARE: nome e cognome del consigliere
   proponente], consigliere comunale del gruppo [DA COMPLETARE: gruppo
   consiliare], ai sensi dell'articolo 43, comma 1, del D.Lgs. 18 agosto 2000,
   n. 267 e dell'articolo [DA COMPLETARE: articolo del regolamento del
   Consiglio comunale di [città] che disciplina la presentazione delle
   mozioni], presenta la seguente proposta di mozione.»

5. «PREMESSO CHE» — i fatti, e solo i fatti.
   - Un capoverso per ciascun fatto ricorrente, non uno per ogni segnalazione.
   - Ogni capoverso comincia con «che» e finisce con punto e virgola; l'ultimo
     con un punto.
   - Ogni capoverso porta almeno un rimando numerato ([3], [1][4][7]). Un
     capoverso senza rimando non può esistere: toglilo o dagli una fonte.
   - Le date si scrivono solo nella forma del punto C e solo quando il
     capoverso riferisce una singola segnalazione datata. Un capoverso che
     aggrega più segnalazioni può non contenere date, e un capoverso che
     riguarda condizioni delle persone non ne contiene mai.
   - Il primo capoverso dice: che i fatti derivano da segnalazioni di cittadini
     raccolte attraverso la piattaforma civica VOCE; quante segnalazioni sono
     richiamate in questo atto; che le date indicate sono quelle di ricezione;
     in quale comune. NON dichiarare quante segnalazioni siano state raccolte
     in tutto né da quanti cittadini distinti: quei totali non ti sono stati
     dati, e un numero non verificabile dichiarato al Consiglio comunale è un
     numero che qualcuno può chiedere di dimostrare.
   - Il quartiere si scrive solo se compare nelle segnalazioni richiamate.
     Altrimenti si scrive il solo comune: attribuire il problema a un quartiere
     preciso restringe a poche persone di quella zona un gruppo che le
     segnalazioni non collocano lì.
   - Una segnalazione che non indica alcun luogo non entra in nessun capoverso
     che afferma un luogo: va conteggiata a parte, dicendo espressamente che non
     indica il luogo. Contarla fra i fatti riferiti a una struttura dà all'ente
     la difesa più economica che ci sia.
   - Ciò che compare in una sola segnalazione resta al singolare: «una
     segnalazione riferisce che…».
   - Non specificare a quale fase si riferisce un tempo se la segnalazione non
     lo dice: niente «prima della presa in carico», «prima della visita»,
     «di permanenza». Se la segnalazione dice «ho aspettato otto ore», l'atto
     dice «un'attesa di otto ore».
   - Non qualificare le persone di cui parlano le segnalazioni («fragili»,
     «vulnerabili», «a rischio», «in condizioni di fragilità») se la
     segnalazione non lo fa.
   - Non combinare due elementi di una stessa segnalazione in un terzo fatto
     che essa non afferma: se una segnalazione dice che la sala era piena e che
     c'erano molte persone anziane, non scrivere che le persone anziane erano
     in piedi.
   - Aggettivi valutativi vietati: «inaccettabile», «gravissimo», «vergognoso»
     non sono fatti e indeboliscono l'atto.

6. «CONSIDERATO CHE» — competenze e quadro normativo.
   - Richiama solo i riferimenti dell'elenco in fondo a queste istruzioni, solo
     quelli pertinenti e solo alle condizioni d'uso indicate accanto a ciascuno.
     Un riferimento fuori tema è peggio di un riferimento assente.
   - NESSUNA AFFERMAZIONE DI DIRITTO SENZA FONTE. Non scrivere che una materia
     è, o non è, di competenza di un ente se la norma che lo stabilisce non è
     nell'elenco. Un'affermazione di diritto senza citazione è la più
     pericolosa che tu possa scrivere, perché non sembra una citazione e
     nessuno la verifica.
   - Se la materia non appare di competenza comunale, scrivilo in forma non
     normativa e con il segnaposto: «la materia non rientra fra le competenze
     dirette del Comune [DA COMPLETARE: indicare l'ente competente e la norma
     che gliela attribuisce, da verificare prima del deposito]». Non nominare
     l'ente competente se non compare nel materiale.
   - Non attribuire al Comune poteri che non ha: una mozione che chiede al
     Sindaco di fare ciò che non può fare resta lettera morta.

7. «RILEVATO CHE» — sezione facoltativa, solo se ci sono lacune informative che
   contano: dati che il Comune ha e i cittadini no, riscontri mai ricevuti,
   informazioni che le segnalazioni non contengono. Se non ce ne sono, ometti la
   sezione: non riempirla per simmetria.

8. «TUTTO CIÒ PREMESSO, IL CONSIGLIO COMUNALE IMPEGNA IL SINDACO E LA GIUNTA A:»
   — elenco numerato, da tre a sei punti.
   - Ogni impegno comincia con un verbo all'infinito: chiedere, trasmettere,
     convocare, verificare, pubblicare, riferire.
   - Ogni impegno è concreto (si capisce chi fa che cosa) e verificabile
     (produce un atto, un documento, una seduta o una risposta scritta).
   - Distingui due percorsi, perché non hanno la stessa forza:
     a) i dati che il Comune, o una sua azienda o ente dipendente, già detiene:
        il consigliere può ottenerli dagli uffici ai sensi dell'art. 43,
        comma 2, del TUEL, e l'impegno può richiamarlo;
     b) i dati di un ente terzo (azienda sanitaria, azienda di trasporto, ente
        regionale): non è un ente dipendente dal comune, quindi l'art. 43,
        comma 2, non ci arriva. L'impegno è di chiedere formalmente il dato.
   - Termini. Gli impegni rivolti al Comune hanno un termine «entro N giorni
     dall'approvazione della presente mozione». Il termine chiesto a un ente
     terzo è una richiesta, non un obbligo: si scrive «chiedendo riscontro
     entro trenta giorni» e mai «l'ente è tenuto a rispondere entro trenta
     giorni». Nessuna norma dell'elenco impone a un ente terzo di rispondere a
     una mozione.
   - Se un impegno chiede dati a un ente terzo, uno degli impegni successivi
     chiude la catena: in caso di mancato riscontro o di diniego, presentare
     istanza di accesso civico generalizzato ai sensi dell'art. 5, comma 2, del
     D.Lgs. 33/2013 — il cui procedimento si conclude con provvedimento
     espresso e motivato entro trenta giorni (art. 5, comma 6) — e, ove
     necessario, chiedere il riesame al responsabile della prevenzione della
     corruzione e della trasparenza (art. 5, comma 7). Senza questo passo la
     mozione muore al primo silenzio.
   - Se un impegno prevede di pubblicare atti o riscontri sul sito
     istituzionale, richiama l'art. 7-bis, comma 3, del D.Lgs. 33/2013 e scrivi
     che la pubblicazione avviene indicando in forma anonima i dati personali
     eventualmente presenti.
   - Nessun impegno può prevedere di trasmettere a terzi date, luoghi o
     dettagli delle singole segnalazioni.
   - Mai date di calendario: non sai quando la mozione sarà discussa.
   - L'ultimo impegno è sempre quello di riferire al Consiglio l'esito, per
     iscritto, entro un termine indicato, anche in caso di mancato riscontro.
   - Nessun impegno di spesa, nessun importo, nessuna assunzione, nessuna
     opera: la copertura finanziaria non è materia di mozione e nessun dato di
     bilancio ti è stato dato.

9. Chiusura:
   «[città], [DA COMPLETARE: data di deposito]»
   «Il consigliere proponente [DA COMPLETARE: firma]»
   «Eventuali consiglieri co-firmatari: [DA COMPLETARE]»

10. «Note per la revisione» — elenco puntato di ciò che il consigliere deve
    verificare prima del deposito: chi presiede il consiglio in quel comune,
    estremi del regolamento consiliare, destinatario esatto, ente competente per
    la materia, lacune informative, allegati. Se non c'è nulla da verificare
    scrivi «Nessuna».

COSA NON FARE, MAI
- Non far parlare i cittadini in prima persona e non trasformare la mozione in
  un appello o in una petizione.
- Non scrivere né annunciare alcun elenco di sottoscrittori, firmatari o
  cittadini.
- Non citare articoli del TUEL, di altre leggi, dello statuto o del regolamento
  consiliare che non siano nell'elenco qui sotto.
- Non scrivere «si chiede» nella parte dispositiva: la mozione «impegna».
- Non usare punti esclamativi, superlativi, formule di denuncia o di campagna
  elettorale.
- Non quantificare ciò che non ti è stato dato: nessuna media, nessuna
  percentuale, nessuna stima di costo, nessun numero di posti letto o di
  personale.
- Non citare delibere, atti, sopralluoghi o dati che non compaiono nel
  materiale.
- Non scrivere la sezione «Segnalazioni richiamate»: la aggiunge il sistema.
- Non aggiungere di tuo un'avvertenza sull'uso dell'intelligenza artificiale:
  l'atto viene pubblicato accompagnato da questa, aggiunta dal sistema —
  «${DISCLAIMER_AI}»

LUNGHEZZA
Fra 400 e 800 parole nel corpo, esclusa la sezione «Note per la revisione». Una
mozione lunga non viene letta e non viene discussa.

CONTROLLO FINALE, prima di rispondere
- la prima riga è l'avviso del punto A, parola per parola;
- l'intestazione porta l'alternativa sulla presidenza del consiglio e il
  relativo segnaposto di verifica;
- l'oggetto sta in una riga e non afferma un dato più alto di quello
  dimostrabile dalle segnalazioni richiamate;
- ogni capoverso del PREMESSO CHE ha almeno un rimando [n];
- nessun capoverso associa una condizione di salute, un'età o un rapporto di
  parentela a una data puntuale;
- nessuna segnalazione priva di luogo è conteggiata fra i fatti riferiti a un
  luogo;
- nessuna data compare fuori da quelle del materiale e da quelle contenute
  negli estremi delle norme;
- nessun numero civico e nessun indirizzo preciso;
- nessuna affermazione di diritto priva di un riferimento dell'elenco o di un
  segnaposto;
- compaiono solo riferimenti normativi presenti nell'elenco fornito;
- non compare il nome di nessuna persona fisica e non compare, né è annunciato,
  alcun elenco di sottoscrittori, firmatari o cittadini;
- la parte dispositiva si apre con IMPEGNA e ha da tre a sei punti numerati;
- l'ultimo impegno prevede di riferire al Consiglio;
- c'è la sezione «Note per la revisione» e NON c'è la sezione «Segnalazioni
  richiamate».
Se un controllo non passa, correggi il testo prima di consegnarlo.

RIFERIMENTI NORMATIVI UTILIZZABILI (nessun altro, a nessun titolo)
${formatReferences()}`

/** Costruisce il materiale su cui il modello deve scrivere. */
function buildUserPrompt(ctx: ContestoAtto): string {
  const { cluster, citazioni, destinatario } = ctx

  const rigaDestinatario = destinatario
    ? `Contatto disponibile per questo atto: ${destinatario}\n` +
      'Riportalo sotto le righe di intestazione, tale e quale. Non sostituirlo alle ' +
      "righe di intestazione e non togliere il segnaposto sulla presidenza del consiglio: " +
      'il contatto potrebbe riferirsi a una carica diversa da quella che in questo comune ' +
      'presiede il consiglio.'
    : "Nessun contatto verificato è disponibile. Nell'intestazione lascia solo le righe " +
      'previste dalla struttura, con il segnaposto di verifica, e ripeti la lacuna fra le ' +
      '«Note per la revisione». Non dedurre e non inventare un ufficio, una carica o un ' +
      'indirizzo.'

  // Senza fatti non si scrive un atto: meglio nessuna bozza che una bozza vuota.
  if (citazioni.length === 0) {
    return `MATERIALE PER LA PROPOSTA DI MOZIONE

Comune: ${cluster.citta}

Nessuna segnalazione citabile è stata fornita. Non scrivere la mozione: rispondi
con la sola riga MATERIALE INSUFFICIENTE.`
  }

  const senzaLuogo = citazioni.filter((c) => !sanitizePlace(c.luogo)).length

  const rigaQuartiere = cluster.quartiere
    ? `Quartiere indicato nei dati del gruppo: ${cluster.quartiere}\n` +
      "  Questa indicazione viene dai dati del gruppo, non dalle segnalazioni. Scrivila " +
      "nell'atto SOLO se il quartiere compare nelle segnalazioni richiamate qui sotto; " +
      'altrimenti scrivi il solo comune.'
    : 'Quartiere: non indicato. Nell\'atto scrivi il solo comune.'

  const rigaSenzaLuogo =
    senzaLuogo === 0
      ? 'Tutte indicano un luogo.'
      : senzaLuogo === 1
        ? 'Di queste, una non indica alcun luogo: non può entrare in un capoverso che ' +
          'afferma un luogo o una struttura, e va conteggiata a parte.'
        : `Di queste, ${senzaLuogo} non indicano alcun luogo: non possono entrare in un ` +
          'capoverso che afferma un luogo o una struttura, e vanno conteggiate a parte.'

  return `MATERIALE PER LA PROPOSTA DI MOZIONE
Non uscire da qui: ciò che non è scritto sotto non esiste.

Comune: ${cluster.citta}
${rigaQuartiere}
Categoria: ${cluster.categoria}

TITOLO E RIASSUNTO DEL GRUPPO — NON SONO PROVA
Titolo: ${cluster.titolo}
Riassunto: ${cluster.riassunto}
Questi due campi sono prodotti da un sistema automatico a partire anche da
segnalazioni che non puoi citare. Servono solo a farti capire di che argomento
si tratta: non citarli, non ricavarne fatti, non usarli nell'oggetto e non
riprenderne le quantificazioni. Se il titolo dice «oltre sei ore» e le
segnalazioni richiamate dicono cinque, vale cinque.

DESTINATARIO
${rigaDestinatario}

SEGNALAZIONI RICHIAMABILI: ${citazioni.length}
${rigaSenzaLuogo}
Questo è l'unico numero che puoi dichiarare nell'atto. Il totale delle
segnalazioni raccolte nel gruppo e il numero dei cittadini distinti non ti
vengono dati e non vanno scritti.
Usa i numeri fra parentesi quadre così come sono, non rinumerarli e non citarne
altri. Le date qui sotto sono DATE DI RICEZIONE della segnalazione, non date del
fatto, e sono le uniche che puoi scrivere nell'atto oltre a quelle contenute
negli estremi delle norme.

${formatCitations(citazioni)}

Scrivi ora la proposta di mozione seguendo la struttura indicata. Ricava il
periodo coperto dalle date di ricezione che vedi qui sopra, dichiarandolo come
tale. Non aggiungere alcun fatto che non compaia in questo materiale.`
}

// ---------------------------------------------------------------------------
// Controlli deterministici sull'atto prodotto
// ---------------------------------------------------------------------------

/**
 * Esito dei controlli automatici su una bozza di mozione.
 *
 * Il CONTROLLO FINALE scritto nel prompt è una richiesta al modello, non una
 * garanzia: un modello che sbaglia un capoverso sbaglia con la stessa
 * probabilità la voce sulla privacy. Le voci verificabili in modo
 * deterministico stanno quindi anche qui, in codice.
 *
 * Uso previsto: `generateDossier` chiama `validaMozione` sul testo prodotto e,
 * se `ok` è falso, NON salva l'atto — rigenera o registra il fallimento. Un
 * atto incompleto o pericoloso salvato come bozza è peggio di nessun atto,
 * perché qualcuno lo leggerà come già filtrato.
 */
export interface EsitoValidazioneMozione {
  ok: boolean
  violazioni: string[]
}

const REGEX_DATA_ESTESA =
  /\b(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})\b/gi

const REGEX_DATA_NUMERICA = /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/

const REGEX_ARTICOLO =
  /\bart(?:icolo)?\.?\s*(\d+)(?:\s*[-‑–]\s*(bis|ter|quater|quinquies|sexies|septies))?/gi

const REGEX_RIMANDO = /\[(\d+)\]/g

/**
 * Marcatori di un dato personale riferito a una persona singola.
 * Diventano una violazione solo quando compaiono nella stessa frase di una
 * data: è quella combinazione a rendere identificabile qualcuno nel registro
 * della struttura di cui l'atto parla.
 */
const REGEX_DATO_PERSONALE =
  /\b(febbre|dolor[ei]|sintom\w*|diagnos\w*|malor[ei]|patologi\w*|incinta|gravidanz\w*|disabil\w*|invalid\w*|anzian\w*|minorenn\w*|neonat\w*|bambin\w*|figli[oa]|madre|padre|marit[oi]|moglie|nonn[aeio])\b|\b(?:un|una|il|la|del|della|dello)\s+minore\b|\bdi\s+\d{1,3}\s+anni\b/i

/** «via Roma 15», «piazza Duomo, 3»: un indirizzo che identifica una casa. */
const REGEX_CIVICO =
  /\b(?:via|viale|piazza|piazzale|corso|largo|vicolo|strada|lungomare)\s+[A-ZÀ-Ü][^;.\n,]{0,40},?\s+\d{1,4}\b/

const REGEX_TITOLO_SEGNALAZIONI =
  /^\s*(?:#{1,6}\s*)?\*{0,2}\s*segnalazioni\s+richiamate\s*\*{0,2}\s*:?\s*$/im

/** Testo confrontabile: senza marcatori Markdown, virgolette e spazi doppi. */
function normalizza(testo: string): string {
  return testo
    .toLowerCase()
    .replace(/[*_>#«»"'‘’“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function raccogliDate(testo: string): string[] {
  const trovate: string[] = []
  for (const m of testo.matchAll(REGEX_DATA_ESTESA)) {
    trovate.push(`${Number(m[1])} ${m[2].toLowerCase()} ${m[3]}`)
  }
  return trovate
}

function raccogliArticoli(testo: string): string[] {
  const trovati: string[] = []
  for (const m of testo.matchAll(REGEX_ARTICOLO)) {
    trovati.push(m[2] ? `${m[1]}-${m[2].toLowerCase()}` : m[1])
  }
  return trovati
}

/**
 * I capoversi di una sezione, ricostruiti dalle righe.
 *
 * Il prompt impone che ogni capoverso del PREMESSO CHE cominci con «che»: le
 * righe che non cominciano così sono continuazioni della precedente, non
 * capoversi nuovi. Senza questa ricomposizione un testo mandato a capo a mano
 * produrrebbe falsi allarmi.
 */
function capoversiDellaSezione(righe: string[], inizio: RegExp, fine: RegExp): string[] {
  const primo = righe.findIndex((r) => inizio.test(r))
  if (primo === -1) return []

  const capoversi: string[] = []
  for (let i = primo + 1; i < righe.length; i++) {
    const riga = righe[i].trim()
    if (fine.test(riga)) break
    if (!riga || /^[-*_]{3,}$/.test(riga)) continue

    const nudo = riga.replace(/^\s*(?:[-*•]\s+|\d+[.)]\s+)/, '').replace(/^\*{1,2}/, '')
    const apreCapoverso = /^che\b/i.test(nudo) || /^\s*(?:[-*•]\s+|\d+[.)]\s+)/.test(riga)

    if (apreCapoverso || capoversi.length === 0) capoversi.push(nudo)
    else capoversi[capoversi.length - 1] += ` ${nudo}`
  }
  return capoversi
}

/**
 * Controlli deterministici su una bozza di mozione.
 *
 * Non sostituiscono la revisione umana e non pretendono di coprire tutto: il
 * nome di una persona fisica, per dire, non è riconoscibile in modo
 * affidabile da una regola. Coprono ciò che è verificabile con certezza, e
 * quello lo bloccano davvero.
 */
export function validaMozione(corpo: string, ctx: ContestoAtto): EsitoValidazioneMozione {
  const violazioni: string[] = []
  const righe = corpo.split('\n')
  const testoNormalizzato = normalizza(corpo)

  // 1. L'avviso che si tratta di una proposta non depositata né approvata.
  if (!testoNormalizzato.slice(0, 800).includes(normalizza(AVVISO_PROPOSTA))) {
    violazioni.push(
      "manca in testa all'atto l'avviso che si tratta di una proposta non depositata, " +
        'non discussa e non approvata',
    )
  }

  // 2. Intestazione e oggetto.
  if (!/oggetto\s*:/i.test(corpo)) {
    violazioni.push('manca la riga «OGGETTO:»')
  }
  if (!corpo.includes('[DA COMPLETARE')) {
    violazioni.push(
      'manca ogni segnaposto [DA COMPLETARE]: almeno l\'articolo del regolamento ' +
        'consiliare e i dati del proponente non possono essere noti',
    )
  }

  // 3. Ogni capoverso del PREMESSO CHE porta almeno un rimando numerato.
  const capoversi = capoversiDellaSezione(
    righe,
    /premesso\s+che/i,
    /^\s*(?:#{1,6}\s*)?\*{0,2}\s*(?:considerato|rilevato|tutto\s+ci|note\s+per|il\s+consiglio\s+comunale\s+impegna)/i,
  )
  if (capoversi.length === 0) {
    violazioni.push('manca la sezione «PREMESSO CHE» o non contiene capoversi')
  }
  capoversi.forEach((c, i) => {
    if (!/\[\d+\]/.test(c)) {
      violazioni.push(
        `il capoverso ${i + 1} del PREMESSO CHE non richiama alcuna segnalazione: ` +
          `«${c.slice(0, 80)}…»`,
      )
    }
  })

  // 4. I rimandi usati esistono fra quelli forniti.
  const indiciAmmessi = new Set(ctx.citazioni.map((c) => c.indice))
  for (const m of corpo.matchAll(REGEX_RIMANDO)) {
    if (!indiciAmmessi.has(Number(m[1]))) {
      violazioni.push(`il rimando [${m[1]}] non corrisponde ad alcuna segnalazione fornita`)
    }
  }

  // 5. Nessuna data inventata: valgono quelle delle segnalazioni e quelle
  //    contenute negli estremi delle norme dell'elenco.
  const dateAmmesse = new Set<string>()
  for (const c of ctx.citazioni) for (const d of raccogliDate(c.data)) dateAmmesse.add(d)
  for (const e of REFERENCE_CATALOG) {
    for (const d of raccogliDate(`${e.reference.citazione} ${e.reference.contenuto}`)) {
      dateAmmesse.add(d)
    }
  }
  for (const d of new Set(raccogliDate(corpo))) {
    if (!dateAmmesse.has(d)) {
      violazioni.push(`la data «${d}» non compare nel materiale fornito`)
    }
  }
  if (REGEX_DATA_NUMERICA.test(corpo)) {
    violazioni.push('compare una data in formato numerico: le date del materiale sono estese')
  }

  // 6. Nessun articolo fuori dall'elenco fornito.
  const articoliAmmessi = new Set<string>()
  for (const e of REFERENCE_CATALOG) {
    for (const a of raccogliArticoli(`${e.reference.citazione} ${e.reference.contenuto}`)) {
      articoliAmmessi.add(a)
    }
  }
  for (const a of new Set(raccogliArticoli(corpo))) {
    if (!articoliAmmessi.has(a)) {
      violazioni.push(`l'articolo «art. ${a}» non è fra i riferimenti forniti`)
    }
  }

  // 7. Nessuna condizione personale associata a una data puntuale.
  const frasi = corpo.replace(/([.;:])\s+/g, '$1\n').split('\n')
  for (const frase of frasi) {
    const conData = raccogliDate(frase).length > 0
    if (conData && REGEX_DATO_PERSONALE.test(frase)) {
      violazioni.push(
        'una frase associa una condizione personale (salute, età, parentela) a una ' +
          `data puntuale: «${frase.trim().slice(0, 100)}…»`,
      )
    }
  }

  // 8. Nessun indirizzo con numero civico.
  if (REGEX_CIVICO.test(corpo)) {
    violazioni.push('compare un indirizzo con numero civico')
  }

  // 9. Nessun elenco di sottoscrittori, firmatari o cittadini.
  const senzaCofirmatari = corpo.replace(/co[-\s]?firmatar\w*/gi, '')
  if (/sottoscrittor\w*/i.test(senzaCofirmatari) || /\bfirmatar\w*/i.test(senzaCofirmatari)) {
    violazioni.push(
      'l\'atto nomina sottoscrittori o firmatari diversi dai consiglieri co-firmatari',
    )
  }
  if (/elenco[^.\n]{0,30}cittadin\w*/i.test(corpo)) {
    violazioni.push("l'atto annuncia un elenco di cittadini")
  }

  // 10. La sezione delle segnalazioni la aggiunge il sistema, non il modello.
  if (REGEX_TITOLO_SEGNALAZIONI.test(corpo)) {
    violazioni.push(
      'l\'atto contiene già una sezione «Segnalazioni richiamate»: il sistema ne ' +
        'aggiungerebbe una seconda, con numeri diversi',
    )
  }

  // 11. Parte dispositiva: da tre a sei impegni numerati.
  // Si cerca prima la formula completa, perché la parola «impegna» può comparire
  // anche nelle premesse e farebbe partire il conteggio dal punto sbagliato.
  const cercaImpegna = (r: string) => /impegna\s+il\s+sindaco/i.test(r)
  const inizioImpegni = righe.some(cercaImpegna)
    ? righe.findIndex(cercaImpegna)
    : righe.findIndex((r) => /\bimpegna\b/i.test(r))
  if (inizioImpegni === -1) {
    violazioni.push('manca la parte dispositiva che apre con IMPEGNA')
  } else {
    let impegni = 0
    for (let i = inizioImpegni + 1; i < righe.length; i++) {
      if (/note\s+per\s+la\s+revisione/i.test(righe[i])) break
      if (/^\s*\d+[.)]\s+\S/.test(righe[i])) impegni++
    }
    if (impegni < 3 || impegni > 6) {
      violazioni.push(`gli impegni numerati sono ${impegni}: devono essere da tre a sei`)
    }
  }

  // 12. L'ultimo passo è sempre riferire al Consiglio.
  if (!/riferi\w*[^.\n]{0,60}consiglio/i.test(corpo)) {
    violazioni.push("manca l'impegno di riferire al Consiglio l'esito")
  }

  return { ok: violazioni.length === 0, violazioni }
}

/**
 * Titolo dell'azione, come compare in pagina e nelle condivisioni.
 *
 * Non usa `cluster.titolo`: quel campo è prodotto da un sistema automatico su
 * tutte le segnalazioni del gruppo, comprese quelle non citabili, e tende ad
 * arrotondare verso l'alto («oltre sei ore» quando le segnalazioni richiamate
 * dicono cinque). Il titolo è la sola riga che verrà ripresa e citata: qui
 * dentro va solo ciò che è verificabile.
 */
function buildTitle(ctx: ContestoAtto): string {
  const categoria = CATEGORY_LABELS[ctx.cluster.categoria] ?? 'Segnalazioni dei cittadini'
  const n = ctx.citazioni.length
  const richiamate = n === 1 ? '1 segnalazione richiamata' : `${n} segnalazioni richiamate`
  return `Proposta di mozione al Consiglio comunale di ${ctx.cluster.citta} — ${categoria} (${richiamate})`
}

export const mozioneConsigliere: ModelloAtto = {
  kind: 'mozione_consigliere',

  /**
   * Il destinatario è chi presiede il consiglio comunale, non un consigliere
   * qualunque: cercare il ruolo `consigliere` in `pa_endpoints` produrrebbe un
   * contatto diverso da quello annunciato nell'intestazione, cioè un atto
   * indirizzato alla persona sbagliata proprio quando il dato è disponibile.
   * Se in `pa_endpoints` non c'è questo ruolo per la città, il destinatario
   * resta null e l'atto porta il segnaposto: meglio bloccato che spedito a chi
   * non ha titolo per iscriverlo all'ordine del giorno.
   */
  ruoloDestinatario: 'presidente_consiglio_comunale',

  /**
   * Firme necessarie prima di considerare la proposta sostenuta (PLAN.md §5.4:
   * 30 per gli atti diversi dall'esposto).
   *
   * Attenzione a che cosa significano qui: la mozione la firma il consigliere,
   * non i cittadini. Le firme raccolte su VOCE sono un SOSTEGNO alla proposta,
   * restano nel database e non vengono trasmesse a nessuna amministrazione;
   * nell'atto può comparire soltanto il loro numero. Il corpo dell'atto non
   * contiene e non annuncia alcun elenco nominativo — lo impone il prompt e lo
   * verifica `validaMozione`.
   */
  firmeObiettivo: 30,

  titolo: buildTitle,
  systemPrompt: SYSTEM_PROMPT,
  userPrompt: buildUserPrompt,
  riferimenti: RIFERIMENTI,

  /**
   * Nessun termine di legge, e qui il `null` è il risultato di una verifica,
   * non di una rinuncia.
   *
   * Il TUEL non fissa un termine entro cui una mozione debba essere iscritta
   * all'ordine del giorno o discussa: la disciplina sta nel **regolamento del
   * consiglio comunale**, che cambia da comune a comune — trenta giorni in uno,
   * «la prima seduta utile» in un altro, niente affatto in un terzo. Un termine
   * inventato a tavolino farebbe scrivere a un consigliere che il consiglio è
   * in ritardo quando non lo è: è il modo più rapido di bruciare la credibilità
   * della proposta e di chi l'ha firmata.
   *
   * Conseguenza operativa, dichiarata perché non si scopra per caso: la catena
   * `action_follow_up_kind()` mappa `mozione_consigliere` → `sollecito`, ma
   * senza termine `deadline_at` resta null e quel ramo non si attiva mai.
   * Diventerà percorribile quando il termine sarà letto dal regolamento del
   * comune specifico, che è un dato per città e non per tipo di atto.
   */
  termine: null,
}
