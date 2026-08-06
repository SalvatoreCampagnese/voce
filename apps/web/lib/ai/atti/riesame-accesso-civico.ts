/**
 * Richiesta di riesame in materia di accesso civico generalizzato —
 * art. 5, comma 7, D.Lgs. 14 marzo 2013, n. 33.
 *
 * Nasce dallo scadenzario (PLAN2 §3.1): si prepara quando un'istanza di accesso
 * civico generalizzato ha superato i trenta giorni dell'art. 5, comma 6, senza
 * che risulti pervenuto un provvedimento espresso.
 *
 * PERCHÉ NON È UN SOLLECITO, E PERCHÉ LA DIFFERENZA CONTA.
 * L'accesso civico generalizzato ha un rimedio suo, tipizzato: la richiesta di
 * riesame davanti al responsabile della prevenzione della corruzione e della
 * trasparenza, che decide con provvedimento motivato entro venti giorni. È una
 * figura diversa da quella che ha ricevuto l'istanza — l'art. 43 le assegna il
 * compito di vigilare sugli obblighi di trasparenza — e ha un termine proprio.
 * Mandare a quell'ufficio un «sollecito» generico fondato sulla L. 241/1990
 * significa scrivere l'atto sbagliato alla persona giusta, e perdere il rimedio.
 *
 * UNA PRECISAZIONE CHE CORREGGE UN ERRORE RICORRENTE.
 * Il riesame dell'art. 5, comma 7, si presenta al **responsabile della
 * prevenzione della corruzione e della trasparenza**, non al «titolare del
 * potere sostitutivo»: quest'ultimo è la figura dell'art. 2, comma 9-bis, della
 * L. 241/1990 e appartiene al procedimento amministrativo generale, non
 * all'accesso civico. Confonderli manda l'atto a un ufficio che non ha
 * competenza a deciderlo.
 *
 * IL RISCHIO SPECIFICO DI QUESTO ATTO.
 * La piattaforma sa soltanto che nel proprio archivio non risulta registrata
 * alcuna risposta. Non sa se l'amministrazione abbia comunicato per altra via,
 * né se il termine sia stato sospeso per la comunicazione ai controinteressati
 * (art. 5, comma 5). Affermare che «l'amministrazione ha negato l'accesso» o
 * ipotizzare i motivi di un diniego che nessuno ha letto significa fondare il
 * riesame su un presupposto falso: il responsabile lo dichiarerebbe
 * inammissibile e la strada resterebbe chiusa. Da qui le formule di cautela
 * obbligatorie.
 *
 * Tutti i riferimenti in fondo al file sono stati verificati sul testo vigente
 * pubblicato da Normattiva, dalla Gazzetta Ufficiale o dall'autorità che ha
 * adottato l'atto: l'URL è nel campo `fonte`.
 */

import {
  REGOLE_COMUNI,
  type AttoPrecedente,
  type ContestoAtto,
  type ModelloAtto,
  type RiferimentoNormativo,
  type SegnalazioneCitabile,
} from './tipi'
// Marcatori condivisi: la pagina pubblica e il PDF tolgono la sezione di
// servizio cercando queste stringhe esatte.
import { NOTE_REVISIONE_FINE, NOTE_REVISIONE_INIZIO } from './accesso-civico'

const FONTE_33_ART_5 =
  'https://www.normattiva.it/atto/caricaDettaglioAtto?atto.dataPubblicazioneGazzetta=2013-04-05&atto.codiceRedazionale=13G00076&atto.articolo.numero=5&atto.articolo.sottoArticolo=1&atto.articolo.sottoArticolo1=10&atto.articolo.flagTipoArticolo=0'

const FONTE_33_ART_5_BIS =
  'https://www.normattiva.it/atto/caricaDettaglioAtto?atto.dataPubblicazioneGazzetta=2013-04-05&atto.codiceRedazionale=13G00076&atto.articolo.numero=5&atto.articolo.sottoArticolo=2&atto.articolo.sottoArticolo1=10&atto.articolo.flagTipoArticolo=1'

/**
 * L'elenco chiuso delle norme citabili.
 *
 * Il testo dei commi è riportato per intero, con la stessa formulazione già
 * verificata per il modello dell'accesso civico: i due atti parlano della
 * stessa vicenda a venti giorni di distanza, e due parafrasi diverse della
 * stessa norma nello stesso fascicolo sono un difetto visibile.
 *
 * ECCEZIONE DICHIARATA, DA RIALLINEARE.
 * Il comma 8 qui sotto è stato riportato alla lettera del testo vigente.
 * `lib/ai/atti/accesso-civico.ts` porta ancora la vecchia versione, priva di
 * tre periodi e con una frase di commento estranea alla norma: finché non
 * viene corretta anche lì, i due modelli citano il comma 8 in due modi. La
 * correzione da applicare è identica a questa ed è indicata nel report; è la
 * versione fedele a vincere, non la coerenza fra i due file.
 */
const RIFERIMENTI: RiferimentoNormativo[] = [
  {
    citazione: 'art. 5, comma 2, D.Lgs. 33/2013',
    contenuto:
      'Allo scopo di favorire forme diffuse di controllo sul perseguimento delle funzioni istituzionali e sull\'utilizzo delle risorse pubbliche e di promuovere la partecipazione al dibattito pubblico, chiunque ha diritto di accedere ai dati e ai documenti detenuti dalle pubbliche amministrazioni, ulteriori rispetto a quelli oggetto di pubblicazione ai sensi del presente decreto, nel rispetto dei limiti relativi alla tutela di interessi giuridicamente rilevanti previsti dall\'articolo 5-bis.',
    fonte: FONTE_33_ART_5,
  },
  {
    citazione: 'art. 5, comma 3, D.Lgs. 33/2013',
    contenuto:
      'L\'esercizio del diritto non è sottoposto ad alcuna limitazione quanto alla legittimazione soggettiva del richiedente; l\'istanza identifica i dati, le informazioni o i documenti richiesti e non richiede motivazione.',
    fonte: FONTE_33_ART_5,
  },
  {
    citazione: 'art. 5, comma 5, D.Lgs. 33/2013',
    contenuto:
      'Se individua soggetti controinteressati ai sensi dell\'art. 5-bis, comma 2, l\'amministrazione ne dà loro comunicazione; i controinteressati possono presentare motivata opposizione entro dieci giorni dalla ricezione della comunicazione e, dalla comunicazione, il termine di conclusione del procedimento previsto dal comma 6 è sospeso fino all\'eventuale opposizione dei controinteressati.',
    fonte: FONTE_33_ART_5,
  },
  {
    citazione: 'art. 5, comma 6, D.Lgs. 33/2013',
    contenuto:
      'Il procedimento deve concludersi con provvedimento espresso e motivato nel termine di trenta giorni dalla presentazione dell\'istanza, con comunicazione al richiedente e agli eventuali controinteressati; il rifiuto, il differimento e la limitazione dell\'accesso devono essere motivati con riferimento ai casi e ai limiti stabiliti dall\'articolo 5-bis.',
    fonte: FONTE_33_ART_5,
  },
  {
    citazione: 'art. 5, comma 7, D.Lgs. 33/2013',
    contenuto:
      'In caso di diniego totale o parziale, oppure di mancata risposta entro il termine di trenta giorni, il richiedente può presentare richiesta di riesame al responsabile della prevenzione della corruzione e della trasparenza, che decide con provvedimento motivato entro venti giorni; se l\'accesso è stato negato o differito a tutela della protezione dei dati personali di cui all\'art. 5-bis, comma 2, lettera a), il responsabile provvede sentito il Garante per la protezione dei dati personali, che si pronuncia entro dieci giorni dalla richiesta, e il termine per l\'adozione del provvedimento di riesame è sospeso fino alla ricezione del parere e comunque per non oltre dieci giorni. Avverso la decisione dell\'amministrazione o del responsabile è ammesso ricorso al Tribunale amministrativo regionale ai sensi dell\'art. 116 del Codice del processo amministrativo.',
    fonte: FONTE_33_ART_5,
  },
  {
    // Riportato alla lettera, e per intero.
    //
    // La versione precedente ne saltava tre periodi — la competenza del
    // difensore civico dell'ambito territoriale immediatamente superiore, la
    // notificazione del ricorso all'amministrazione, e la decorrenza del
    // termine dell'art. 116, comma 1 — e in coda ci aggiungeva una frase di
    // commento («il criterio è soggettivo…») che nella norma non c'è. Siccome
    // questo campo viene stampato testualmente sotto «Riferimenti normativi»,
    // quella versione faceva citare a un cittadino, davanti all'RPCT, un testo
    // di legge che il testo di legge non è. La glossa è ora dove serve davvero:
    // nelle istruzioni al modello, sotto «IL DIFENSORE CIVICO».
    //
    // Ciascuno dei tre periodi omessi vale un rimedio: senza il primo si
    // rinuncia al difensore civico dove l'organo non è costituito, senza il
    // secondo il ricorso è inammissibile, senza il terzo si crede di aver perso
    // i trenta giorni per il TAR quando invece devono ancora cominciare.
    citazione: 'art. 5, comma 8, D.Lgs. 33/2013',
    contenuto:
      'Qualora si tratti di atti delle amministrazioni delle regioni o degli enti locali, il richiedente può altresì presentare ricorso al difensore civico competente per ambito territoriale, ove costituito. Qualora tale organo non sia stato istituito, la competenza è attribuita al difensore civico competente per l\'ambito territoriale immediatamente superiore. Il ricorso va altresì notificato all\'amministrazione interessata. Il difensore civico si pronuncia entro trenta giorni dalla presentazione del ricorso. Se il difensore civico ritiene illegittimo il diniego o il differimento, ne informa il richiedente e lo comunica all\'amministrazione competente. Se questa non conferma il diniego o il differimento entro trenta giorni dal ricevimento della comunicazione del difensore civico, l\'accesso è consentito. Qualora il richiedente l\'accesso si sia rivolto al difensore civico, il termine di cui all\'articolo 116, comma 1, del Codice del processo amministrativo decorre dalla data di ricevimento, da parte del richiedente, dell\'esito della sua istanza al difensore civico. Se l\'accesso è stato negato o differito a tutela degli interessi di cui all\'articolo 5-bis, comma 2, lettera a), il difensore civico provvede sentito il Garante per la protezione dei dati personali, il quale si pronuncia entro il termine di dieci giorni dalla richiesta. A decorrere dalla comunicazione al Garante, il termine per la pronuncia del difensore è sospeso, fino alla ricezione del parere del Garante e comunque per un periodo non superiore ai predetti dieci giorni.',
    fonte: FONTE_33_ART_5,
  },
  {
    citazione: 'art. 5-bis, comma 4, D.Lgs. 33/2013',
    contenuto:
      'Restano fermi gli obblighi di pubblicazione previsti dalla normativa vigente; se i limiti dei commi 1 e 2 riguardano soltanto alcuni dati o alcune parti del documento richiesto, deve essere consentito l\'accesso agli altri dati o alle altre parti.',
    fonte: FONTE_33_ART_5_BIS,
  },
  {
    citazione: 'art. 5-bis, comma 5, D.Lgs. 33/2013',
    contenuto:
      'I limiti si applicano solo per il periodo in cui la protezione è giustificata in relazione alla natura del dato; l\'accesso non può essere negato quando è sufficiente fare ricorso al differimento.',
    fonte: FONTE_33_ART_5_BIS,
  },
  {
    citazione: 'art. 43 D.Lgs. 33/2013',
    contenuto:
      'Il responsabile della prevenzione della corruzione svolge di norma le funzioni di responsabile per la trasparenza, vigila sull\'adempimento degli obblighi di pubblicazione e segnala i casi di inadempimento agli organi di indirizzo, all\'organismo indipendente di valutazione, all\'ANAC e, nei casi più gravi, all\'ufficio di disciplina: è la figura davanti alla quale si chiede il riesame ai sensi dell\'art. 5, comma 7.',
    fonte:
      'https://www.normattiva.it/atto/caricaDettaglioAtto?atto.dataPubblicazioneGazzetta=2013-04-05&atto.codiceRedazionale=13G00076&atto.articolo.numero=43&atto.articolo.sottoArticolo=1&atto.articolo.sottoArticolo1=10&atto.articolo.flagTipoArticolo=0',
  },
  {
    citazione: 'Determinazione ANAC n. 1309 del 28 dicembre 2016',
    contenuto:
      'Linee guida recanti indicazioni operative ai fini della definizione delle esclusioni e dei limiti all\'accesso civico di cui all\'art. 5, comma 2, del D.Lgs. 33/2013, adottate ai sensi dell\'art. 5-bis, comma 6, dello stesso decreto.',
    fonte: 'https://www.anticorruzione.it/-/determinazione-n.-1309-del-28/12/2016-rif.-1',
  },
  {
    citazione: 'art. 116, comma 1, D.Lgs. 104/2010 (Codice del processo amministrativo)',
    contenuto:
      'Il ricorso contro le determinazioni e contro il silenzio sulle istanze di accesso ai documenti amministrativi, nonché per la tutela del diritto di accesso civico connessa all\'inadempimento degli obblighi di trasparenza, si propone entro trenta giorni dalla conoscenza della determinazione impugnata o dalla formazione del silenzio, mediante notificazione all\'amministrazione e ad almeno un controinteressato.',
    fonte:
      'https://www.gazzettaufficiale.it/atto/serie_generale/caricaArticolo?art.versione=3&art.idGruppo=32&art.flagTipoArticolo=2&art.codiceRedazionale=010G0127&art.idArticolo=116&art.idSottoArticolo=1&art.idSottoArticolo1=10&art.dataPubblicazioneGazzetta=2010-07-07&art.progressivo=0',
  },
]

/** «[3] 18 luglio 2026: testo». Il luogo non viene passato: vedi accesso-civico. */
function formattaCitazioni(citazioni: SegnalazioneCitabile[]): string {
  if (citazioni.length === 0) return 'Nessuna segnalazione citabile è stata fornita.'
  return citazioni.map((c) => `[${c.indice}] ${c.data}: ${c.testo}`).join('\n')
}

function formattaRiferimenti(riferimenti: RiferimentoNormativo[]): string {
  return riferimenti.map((r) => `- ${r.citazione}: ${r.contenuto}`).join('\n')
}

function formattaLuogo(cluster: ContestoAtto['cluster']): string {
  return cluster.quartiere ? `${cluster.citta}, quartiere ${cluster.quartiere}` : cluster.citta
}

/** Gli estremi dell'istanza rimasta senza provvedimento, già calcolati. */
function bloccoIstanzaOriginaria(precedente: AttoPrecedente): string {
  const righe = [
    `Tipo di atto: ${precedente.etichetta}`,
    `Titolo con cui è stato registrato: ${precedente.titolo}`,
    `Ufficio a cui è stata trasmessa: ${
      precedente.destinatario ?? 'non registrato — usa un segnaposto'
    }`,
    `Data di presentazione: ${precedente.inviatoIl}`,
    `Termine di legge: ${precedente.giorniTermine} giorni — ${precedente.baseTermine}`,
    `Data di scadenza del termine: ${precedente.scadutoIl}`,
    `Giorni trascorsi dalla scadenza: ${precedente.giorniDallaScadenza}`,
  ]

  if (precedente.corpo) {
    righe.push(
      '',
      'TESTO DELL\'ISTANZA RIMASTA SENZA PROVVEDIMENTO (per ricavarne l\'oggetto, non da ricopiare)',
      precedente.corpo,
    )
  }

  return righe.join('\n')
}

const ISTRUZIONI_SPECIFICHE = `---

ATTO DA REDIGERE: RICHIESTA DI RIESAME IN MATERIA DI ACCESSO CIVICO
GENERALIZZATO
(art. 5, comma 7, D.Lgs. 14 marzo 2013, n. 33)

CHE COSA STAI SCRIVENDO
Un atto breve e procedurale, rivolto al responsabile della prevenzione della
corruzione e della trasparenza dell'amministrazione, perché riesamini una
richiesta di accesso civico generalizzato rimasta senza provvedimento espresso
nel termine di trenta giorni. Non è un esposto, non è una diffida, non è una
denuncia: non accerta responsabilità, non chiede sanzioni, non qualifica come
illecita alcuna condotta.

IL PRESUPPOSTO È IL SILENZIO, NON UN DINIEGO
Questo atto si fonda sulla seconda ipotesi dell'art. 5, comma 7: la mancata
risposta entro il termine. Non ti risulta alcun provvedimento di rifiuto.
  - Non scrivere che l'accesso è stato negato, limitato o differito, e non
    ipotizzare i motivi di un diniego che nessuno ha letto.
  - Non discutere le esclusioni dell'art. 5-bis: nessuna è stata opposta. Puoi
    citare l'art. 5-bis, comma 4, soltanto per chiedere in via subordinata
    l'accesso alle parti non sottratte, ove alcune lo fossero.
  - Un riesame fondato su un presupposto sbagliato viene dichiarato
    inammissibile, e la strada si chiude.

LA REGOLA CHE VIENE PRIMA DI TUTTE: NON SAI SE NON HANNO RISPOSTO
Sai soltanto che al sottoscrittore non risulta pervenuto alcun provvedimento.
Quindi, senza eccezioni:
  - scrivi «alla data odierna non risulta pervenuto al sottoscritto alcun
    provvedimento espresso», mai «l'amministrazione non ha risposto» e mai «è
    rimasta inerte»;
  - accompagna l'affermazione sul decorso del termine con la clausola «ove il
    termine non risulti sospeso ai sensi dell'art. 5, comma 5, per la
    comunicazione ai controinteressati»;
  - aggiungi una frase in questa sostanza: «Ove un provvedimento sia già stato
    adottato o trasmesso, si chiede cortesemente di volerne dare comunicazione
    al recapito indicato, e la presente si intende superata.»;
  - non scrivere che una norma è stata violata né che sussiste un inadempimento;
  - non nominare persone fisiche, in nessun caso e a nessun titolo.

CHI SOTTOSCRIVE
La richiesta di riesame la presenta la stessa persona che ha sottoscritto
l'istanza di accesso: l'art. 5, comma 7, la riserva al richiedente, e solo lui
può poi ricorrere al giudice amministrativo.
  - Vietate le formule «anche a nome di», «per conto dei cittadini firmatari»,
    «in rappresentanza di».
  - Non allegare, non annunciare e non menzionare elenchi di sottoscrittori o di
    segnalanti: l'art. 5, comma 3, esclude ogni limite di legittimazione
    soggettiva, quindi quell'elenco non serve e servirebbe soltanto a consegnare
    all'ente i nomi di chi lo ha criticato.
  - Non indicare un numero di firme raccolte.
  - Scrivi fra le premesse: «I dati identificativi dei cittadini che hanno
    inviato le segnalazioni non sono trasmessi con il presente atto.»

L'OGGETTO DELL'ISTANZA
Ti viene fornito il testo dell'istanza rimasta senza provvedimento. Serve a una
cosa sola: ricavarne, in poche righe, che cosa era stato chiesto.
  - Riassumilo in forma fedele e sintetica, oppure riporta l'elenco dei
    documenti richiesti in forma abbreviata, senza aggiungerne di nuovi, senza
    ampliarne la portata e senza cambiarne il periodo temporale.
  - Chiedere in sede di riesame qualcosa che non era stato chiesto nell'istanza
    rende quella parte inammissibile e indebolisce il resto.
  - Rinvia comunque alla copia allegata, che è l'unico testo che fa fede.
  - Se il testo non ti è stato fornito, indica il solo titolo e la data e lascia
    un segnaposto per l'oggetto.

I FATTI DEL GRUPPO: POCHI, E AGGREGATI
Questo atto verte sul procedimento di accesso, non sui fatti che lo hanno
originato. Puoi richiamare le segnalazioni al massimo in un capoverso, in forma
aggregata e con i riferimenti [n], soltanto per dire che l'interesse alla
conoscibilità è tuttora attuale. Non descrivere episodi individuali, non
accostare mai una data singola a un dettaglio riferito a una persona
(condizione di salute, età, ruolo familiare, professione), non riportare vie,
numeri civici o denominazioni di strutture tratte dalle segnalazioni. L'unico
riferimento geografico è il comune, e l'eventuale quartiere, del gruppo.

STRUTTURA (esattamente queste sezioni, in quest'ordine)
1. Titolo di primo livello: «Richiesta di riesame in materia di accesso civico
   generalizzato», e sotto, su una riga, la base normativa.
2. Blocco di intestazione con «Destinatario:», «e, per conoscenza:» e
   «Oggetto:». L'oggetto sta in una riga e contiene la materia, la data di
   presentazione dell'istanza e il comune.
3. Formula di apertura: «Il/La sottoscritto/a [DA COMPLETARE: nome, cognome,
   luogo e data di nascita, residenza, codice fiscale, recapito]», che dichiara
   di aver presentato in proprio l'istanza indicata.
4. «Premesso che»: un capoverso per ciascuno di questi punti, nell'ordine — la
   presentazione dell'istanza di accesso civico generalizzato con la sua data e
   l'ufficio a cui è stata trasmessa; l'oggetto di quella richiesta in forma
   sintetica; il termine di trenta giorni dell'art. 5, comma 6, con la data di
   scadenza così come ti è stata fornita; la circostanza che non risulta
   pervenuto alcun provvedimento espresso, con la clausola sulla sospensione;
   l'eventuale capoverso sui fatti del gruppo con i riferimenti [n].
5. «Considerato che»: che il procedimento deve concludersi con provvedimento
   espresso e motivato; che in caso di mancata risposta nel termine il
   richiedente può presentare richiesta di riesame al responsabile della
   prevenzione della corruzione e della trasparenza, che decide con
   provvedimento motivato entro venti giorni; che al responsabile l'art. 43
   affida la vigilanza sugli obblighi di trasparenza. Tono espositivo.
6. «Tutto ciò premesso, chiede»: elenco numerato di non più di quattro punti —
   il riesame ai sensi dell'art. 5, comma 7, del D.Lgs. 33/2013 e l'adozione di
   un provvedimento espresso e motivato; l'ostensione dei dati e dei documenti
   indicati nell'istanza; in via subordinata, ove taluni elementi risultino
   sottratti all'accesso, l'accesso alle restanti parti ai sensi dell'art.
   5-bis, comma 4, con oscuramento dei dati personali eventualmente contenuti;
   la comunicazione dell'esito al recapito indicato.
7. «Precisazioni»: la frase sull'eventuale provvedimento già adottato, la
   gratuità del rilascio salvo rimborso dei costi di riproduzione, la
   disponibilità a circoscrivere l'oggetto in caso di difficoltà di estrazione,
   la modalità e il recapito per la risposta (con segnaposto), la non
   trasmissione dei dati dei segnalanti.
8. «Termini e rimedi». Tono informativo, non intimidatorio: si «rammenta», non
   si minaccia. Contiene, in quest'ordine:
   - il termine di venti giorni per il provvedimento motivato di riesame;
   - la precisazione che, se l'accesso fosse negato o differito a tutela della
     protezione dei dati personali di cui all'art. 5-bis, comma 2, lettera a),
     il responsabile provvede sentito il Garante, che si pronuncia entro dieci
     giorni, e il termine per il riesame è sospeso fino alla ricezione del
     parere e comunque per non oltre dieci giorni;
   - il ricorso al Tribunale amministrativo regionale entro trenta giorni dalla
     conoscenza della determinazione impugnata o dalla formazione del silenzio,
     mediante notificazione all'amministrazione e ad almeno un
     controinteressato, ai sensi dell'art. 116, comma 1, del Codice del
     processo amministrativo;
   - che, ove ci si rivolga al difensore civico, quel termine di trenta giorni
     decorre dalla data di ricevimento dell'esito dell'istanza al difensore
     civico, ai sensi dell'art. 5, comma 8, del D.Lgs. 33/2013;
   - il difensore civico SOLO alle condizioni indicate più sotto.
9. Blocco di chiusura: «Luogo e data», «Firma», «Allegati». Fra gli allegati
   indica la copia dell'istanza e la prova del suo invio, come segnaposto:
   «[DA COMPLETARE: copia dell'istanza presentata in data … e ricevuta di
   trasmissione]». Nessun elenco di sottoscrittori.
10. Note per la revisione, racchiuse fra i due marcatori
    ${NOTE_REVISIONE_INIZIO} e ${NOTE_REVISIONE_FINE}, ciascuno su una riga
    propria. Sono l'ultima cosa che scrivi, non sono parte dell'atto e sono
    leggibili anche da chi lo riceverà: contengono soltanto l'elenco dei
    segnaposto rimasti e dei controlli da fare. Non scriverci valutazioni sulla
    solidità dell'atto né ipotesi su come l'amministrazione potrebbe replicare.
    I controlli sempre presenti sono: la denominazione e il recapito del
    responsabile della prevenzione della corruzione e della trasparenza, la
    verifica che nel frattempo non sia arrivato un provvedimento, la natura
    giuridica dell'ente ai fini del rimedio del difensore civico, la
    corrispondenza fra l'oggetto qui riassunto e quello dell'istanza allegata, e
    i dati del richiedente. Aggiungi sempre anche questo controllo, con parole
    tue e in una riga: il termine di trenta giorni per l'eventuale ricorso al
    Tribunale amministrativo regionale non è calcolato da chi ha preparato la
    bozza, perché decorre da un fatto che non risulta registrato — la data in
    cui il richiedente ha conoscenza della decisione o dell'esito — e va quindi
    verificato dal richiedente, se del caso con un legale.

IL DIFENSORE CIVICO: CONDIZIONI PER NOMINARLO
La facoltà di ricorso dell'art. 5, comma 8, dipende da CHI ha adottato l'atto —
«le amministrazioni delle regioni o degli enti locali» — e non dal territorio in
cui il fatto è avvenuto. Il criterio è soggettivo: conta quale amministrazione
ha adottato l'atto. È vietata qualunque parafrasi del tipo «trattandosi di
materia regionale».
  - Se l'amministrazione non ti è nota, non scrivere affatto il rimedio: scrivi
    al suo posto «[DA COMPLETARE: verificare se l'ente è un'amministrazione
    della regione o di un ente locale, se il difensore civico competente per
    ambito territoriale è costituito e con quale denominazione]».
  - Se è nota e rientra nella categoria, scrivi: «ove costituito il difensore
    civico competente per ambito territoriale, resta ferma la facoltà di ricorso
    ai sensi dell'art. 5, comma 8, del D.Lgs. 33/2013; qualora tale organo non
    sia stato istituito, la competenza è attribuita al difensore civico
    competente per l'ambito territoriale immediatamente superiore, e il ricorso
    va altresì notificato all'amministrazione interessata».
  - Il qualificatore «ove costituito» non si omette mai, ed è per questo che
    accanto va sempre il rinvio all'ambito territoriale immediatamente
    superiore: senza, chi legge conclude che dove il difensore civico non c'è
    quella strada è chiusa, mentre la norma la tiene aperta un gradino sopra.
  - L'obbligo di notificare il ricorso anche all'amministrazione interessata non
    si omette mai: è un requisito del ricorso, e un ricorso non notificato non
    viene esaminato.
  - Non scrivere che rivolgersi al difensore civico fa perdere i trenta giorni
    per il ricorso al Tribunale amministrativo regionale: la norma dispone il
    contrario. Se il richiedente si è rivolto al difensore civico, il termine
    dell'art. 116, comma 1, del Codice del processo amministrativo decorre dalla
    data in cui riceve l'esito della sua istanza al difensore civico. Se il
    punto viene toccato, va detto in questa sostanza e non in altra.

REGISTRO
Italiano amministrativo, impersonale, asciutto. I verbi sono «risulta», «non
risulta pervenuto», «si chiede», «si rammenta». Nessun aggettivo di giudizio,
nessun punto esclamativo, nessuna minaccia. Lunghezza complessiva fra 400 e 700
parole.

COSA NON FARE, MAI
- Non affermare che l'amministrazione ha violato una norma o è inadempiente.
- Non affermare che l'accesso è stato negato e non ipotizzare motivi di rifiuto.
- Non nominare persone fisiche.
- Non ampliare l'oggetto dell'istanza e non aggiungere documenti nuovi.
- Non citare norme che non sono nell'elenco fornito, e non usare rinvii aperti
  («e ss.», «la normativa in materia»).
- Non ricopiare il testo delle segnalazioni e non descrivere episodi
  individuali.
- Non chiedere dati personali, sanitari o riferiti a persone identificabili, e
  non chiedere dati a granularità tale da isolare una persona.
- Non scrivere la sezione «Segnalazioni richiamate» e non scrivere un elenco
  finale dei riferimenti normativi: li aggiunge l'applicazione.
- Non scrivere il disclaimer sull'origine automatica della bozza: lo aggiunge
  l'applicazione.
- Non inventare protocolli, PEC, indirizzi o date.

CAMPI OBBLIGATORI: senza anche uno solo di questi l'atto è incompleto e viene
scartato prima della revisione.
  1. destinatario responsabile della prevenzione della corruzione e della
     trasparenza (o il segnaposto) e destinatario per conoscenza;
  2. oggetto in una riga, con materia, data dell'istanza e comune;
  3. formula di sottoscrizione in proprio, con i segnaposto dei dati;
  4. data di presentazione dell'istanza e suo oggetto in forma sintetica;
  5. termine di trenta giorni con la base normativa e la data di scadenza,
     riportate come ti sono state fornite;
  6. dichiarazione che non risulta pervenuto alcun provvedimento espresso, con
     la clausola sulla sospensione dell'art. 5, comma 5;
  7. frase sull'eventuale provvedimento già adottato;
  8. richiamo espresso all'art. 5, comma 7, del D.Lgs. 33/2013 nella richiesta
     di riesame;
  9. richiesta subordinata di accesso parziale ai sensi dell'art. 5-bis, comma 4;
 10. frase sulla non trasmissione dei dati identificativi dei segnalanti;
 11. termine di venti giorni, passaggio davanti al Garante, ricorso al TAR;
 12. modalità e recapito per il riscontro (con segnaposto);
 13. luogo, data, firma e allegati, con la copia dell'istanza;
 14. note per la revisione racchiuse fra i due marcatori.`

const SYSTEM_PROMPT = `${REGOLE_COMUNI}

${ISTRUZIONI_SPECIFICHE}`

/**
 * Modello della richiesta di riesame.
 *
 * `ruoloDestinatario` è `rpct`: il responsabile della prevenzione della
 * corruzione e della trasparenza. È deliberatamente diverso dall'`urp` a cui va
 * l'istanza di accesso — l'art. 5, comma 7, vuole che a riesaminare sia una
 * figura diversa da quella che ha trattato la richiesta, altrimenti il rimedio
 * non è un rimedio. Se `pa_endpoints` non contiene quel ruolo per il comune,
 * l'atto resta con un segnaposto e un controllo esplicito nelle note.
 *
 * `firmeObiettivo` è 30 (PLAN.md §5.4). Le firme danno peso pubblico, non
 * qualità di parte: quella resta di chi ha sottoscritto l'istanza originaria, ed
 * è la stessa persona che deve sottoscrivere questo atto.
 */
export const riesameAccessoCivico: ModelloAtto = {
  kind: 'riesame_accesso_civico',
  ruoloDestinatario: 'rpct',
  firmeObiettivo: 30,

  titolo: (ctx) =>
    `Richiesta di riesame — accesso civico su ${ctx.cluster.titolo} (${ctx.cluster.citta})`,

  systemPrompt: SYSTEM_PROMPT,

  userPrompt: (ctx) => {
    const { cluster, citazioni, destinatario, attoPrecedente } = ctx

    const bloccoDestinatario = destinatario
      ? `${destinatario}\n` +
        'Usa questo destinatario alla lettera: proviene dall\'elenco verificato dei contatti della pubblica amministrazione.\n' +
        'Fra le note per la revisione chiedi comunque di confermare che sia il responsabile della prevenzione della corruzione e della trasparenza di quell\'amministrazione.'
      : 'Nessun contatto verificato disponibile per il responsabile della prevenzione della corruzione e della trasparenza.\n' +
        'Scrivi come destinatario il segnaposto [DA COMPLETARE: responsabile della prevenzione della corruzione e della trasparenza dell\'amministrazione — nominativo dell\'ufficio e recapito, pubblicati nella sezione «Amministrazione trasparente» del sito istituzionale], seguito da [DA COMPLETARE: indirizzo PEC].\n' +
        'Ripeti l\'avvertenza fra le note per la revisione. Non dedurre e non inventare un ufficio o un indirizzo.\n' +
        'Finché l\'amministrazione non è identificata non scrivere il rimedio del difensore civico: dipende dalla sua natura giuridica.'

    const bloccoPrecedente = attoPrecedente
      ? bloccoIstanzaOriginaria(attoPrecedente)
      : 'DATI NON DISPONIBILI. Senza l\'istanza originaria questo riesame non è redigibile: ' +
        'scrivi solo l\'intestazione e le note per la revisione, dichiarando che l\'atto non ' +
        'può essere redatto perché mancano gli estremi dell\'istanza da riesaminare.'

    const conoscenza = attoPrecedente?.destinatario
      ? `Per conoscenza, indica: ${attoPrecedente.destinatario}`
      : 'Per conoscenza, indica il segnaposto [DA COMPLETARE: ufficio a cui era stata trasmessa l\'istanza].'

    return `MATERIALE PER LA RICHIESTA DI RIESAME. Non uscire da qui: ciò che non è scritto sotto non esiste.

ISTANZA RIMASTA SENZA PROVVEDIMENTO
${bloccoPrecedente}

DESTINATARIO
${bloccoDestinatario}
${conoscenza}

GRUPPO DI SEGNALAZIONI (contesto, non oggetto dell'atto)
Titolo del gruppo: ${cluster.titolo}
Categoria: ${cluster.categoria}
Provenienza dei cittadini che hanno segnalato: ${formattaLuogo(cluster)}
(è la zona da cui scrivono, non la sede della struttura interessata)
Segnalazioni richiamabili qui sotto: ${citazioni.length}

SEGNALAZIONI RICHIAMABILI
Usa questi numeri così come sono, non rinumerarli e non citarne altri.
Servono al massimo per un capoverso: l'oggetto di questo atto è il procedimento
di accesso.
${formattaCitazioni(citazioni)}

RIFERIMENTI NORMATIVI DISPONIBILI
Sono gli unici citabili. Il fondamento della richiesta è l'art. 5, comma 7, del
D.Lgs. 33/2013, nella parte relativa alla mancata risposta nel termine.
${formattaRiferimenti(RIFERIMENTI)}

COMPITO
Scrivi la richiesta di riesame seguendo la struttura, i campi obbligatori e i
divieti che ti sono stati dati. Le date e i giorni li trovi nel blocco
dell'istanza rimasta senza provvedimento: trascrivili, non ricalcolarli e non
arrotondarli. Quando un elemento non è determinato dal materiale, lascia un
segnaposto fra parentesi quadre e annotalo fra le note per la revisione.`
  },

  riferimenti: RIFERIMENTI,

  /**
   * Venti giorni, dall'art. 5, comma 7, già nell'elenco qui sopra: il
   * responsabile «decide con provvedimento motivato entro venti giorni».
   *
   * La sospensione per il parere del Garante è scritta dentro `base` e non
   * tolta dal conteggio, per la stessa ragione dell'accesso civico: la
   * piattaforma non sa se il responsabile abbia dovuto sentire il Garante, e
   * dedurlo sarebbe inventare. Chi revisiona l'atto successivo legge la
   * clausola nel `deadline_basis` e verifica prima di firmare.
   */
  termine: {
    giorni: 20,
    base:
      'art. 5, comma 7, D.Lgs. 33/2013 — 20 giorni dalla presentazione della ' +
      'richiesta di riesame; se il diniego è fondato sulla protezione dei dati ' +
      'personali (art. 5-bis, comma 2, lettera a) il termine è sospeso fino alla ' +
      'ricezione del parere del Garante e comunque per non oltre 10 giorni',
  },
}
