/**
 * Accesso civico generalizzato — art. 5, comma 2, D.Lgs. 14 marzo 2013, n. 33.
 *
 * È l'atto più efficace e meno rischioso del dossier: non accusa nessuno, non
 * chiede provvedimenti, chiede carte che l'amministrazione ha l'obbligo di
 * dare, e il rifiuto deve essere motivato per iscritto entro trenta giorni.
 *
 * Il punto in cui questi atti falliscono è sempre lo stesso: la richiesta
 * generica. «Tutta la documentazione relativa al problema» è una richiesta
 * esplorativa e viene respinta — con essa cade anche la parte buona
 * dell'istanza. Per questo il prompt impone che ogni voce dell'elenco sia
 * determinata (che cosa, su che cosa, per quale periodo, presso chi) e che il
 * periodo temporale sia ricavato dalle date delle segnalazioni, non scelto.
 *
 * Il secondo punto — quello che si vede solo se si guarda l'atto dalla parte di
 * chi lo riceve — è la privacy. Questo atto viaggia verso l'ente che detiene i
 * registri delle persone di cui parla: per lui «25 luglio, pronto soccorso,
 * minore con febbre alta, cinque ore di attesa» non è una circostanza, è un
 * nome. Perciò le premesse sono aggregate, il luogo è quello del gruppo e non
 * quello scritto dal segnalante, l'atto non trasmette nessun elenco di
 * sottoscrittori e non chiede dati a granularità tale da isolare una persona.
 *
 * Tutti i riferimenti normativi in fondo al file sono stati verificati uno per
 * uno sul testo vigente pubblicato da Normattiva, dalla Gazzetta Ufficiale o
 * dall'autorità che ha adottato l'atto: l'URL è nel campo `fonte`.
 */

import {
  REGOLE_COMUNI,
  type ContestoAtto,
  type ModelloAtto,
  type RiferimentoNormativo,
  type SegnalazioneCitabile,
} from './tipi'

/**
 * Delimitatori della sezione di servizio destinata a chi revisiona.
 *
 * Le note per la revisione non sono parte dell'atto: sono l'elenco dei
 * segnaposto rimasti e dei controlli da fare prima dell'invio. Restano dentro
 * il Markdown perché non esiste un campo separato sulla tabella `actions`, ma
 * sono racchiuse fra questi due marcatori proprio perché la pagina pubblica e
 * il PDF possano rimuoverle senza indovinare dove comincino.
 *
 * Finché il rendering pubblico non li rimuove, gli atti in stato `bozza` non
 * vanno esposti: la sezione racconta a chiunque quali parti dell'atto sono
 * ancora da completare.
 */
export const NOTE_REVISIONE_INIZIO = '<!-- NOTE-REVISIONE:INIZIO -->'
export const NOTE_REVISIONE_FINE = '<!-- NOTE-REVISIONE:FINE -->'

/**
 * Riferimenti che il modello può citare. Nient'altro.
 *
 * L'ordine non è casuale: prima la base dell'istanza (art. 5), poi i limiti
 * (art. 5-bis), poi i rimedi, e in coda la L. 241/1990 — che serve solo a
 * spiegare perché questa NON è un'istanza di accesso documentale, e che quindi
 * non deve essere motivata (art. 25, c. 2) né soffre del divieto di controllo
 * generalizzato (art. 24, c. 3).
 *
 * I `contenuto` riportano i commi per intero anche dove sarebbe più comodo
 * troncarli: la REGOLA COMUNE n. 4 vieta al modello di citare ciò che non gli è
 * stato dato, quindi un comma tagliato a metà diventa un'informazione che
 * l'atto non potrà mai dare al cittadino. È il caso dei termini sospesi
 * dell'art. 5, commi 5 e 7.
 */
const RIFERIMENTI: RiferimentoNormativo[] = [
  {
    citazione: 'art. 5, comma 2, D.Lgs. 33/2013',
    contenuto:
      'Allo scopo di favorire forme diffuse di controllo sul perseguimento delle funzioni istituzionali e sull\'utilizzo delle risorse pubbliche e di promuovere la partecipazione al dibattito pubblico, chiunque ha diritto di accedere ai dati e ai documenti detenuti dalle pubbliche amministrazioni, ulteriori rispetto a quelli oggetto di pubblicazione ai sensi del presente decreto, nel rispetto dei limiti relativi alla tutela di interessi giuridicamente rilevanti previsti dall\'articolo 5-bis.',
    fonte:
      'https://www.normattiva.it/atto/caricaDettaglioAtto?atto.dataPubblicazioneGazzetta=2013-04-05&atto.codiceRedazionale=13G00076&atto.articolo.numero=5&atto.articolo.sottoArticolo=1&atto.articolo.sottoArticolo1=10&atto.articolo.flagTipoArticolo=0',
  },
  {
    citazione: 'art. 5, comma 3, D.Lgs. 33/2013',
    contenuto:
      'L\'esercizio del diritto non è sottoposto ad alcuna limitazione quanto alla legittimazione soggettiva del richiedente; l\'istanza identifica i dati, le informazioni o i documenti richiesti e non richiede motivazione. L\'istanza è trasmessa in alternativa all\'ufficio che detiene i dati, all\'Ufficio relazioni con il pubblico o all\'altro ufficio indicato dall\'amministrazione nella sezione «Amministrazione trasparente»; la trasmissione al responsabile della prevenzione della corruzione e della trasparenza è prevista dalla sola lettera d) e soltanto «ove l\'istanza abbia a oggetto dati, informazioni o documenti oggetto di pubblicazione obbligatoria ai sensi del presente decreto», ipotesi che non ricorre nell\'accesso generalizzato del comma 2, il quale ha per oggetto dati ulteriori rispetto a quelli pubblicati.',
    fonte:
      'https://www.normattiva.it/atto/caricaDettaglioAtto?atto.dataPubblicazioneGazzetta=2013-04-05&atto.codiceRedazionale=13G00076&atto.articolo.numero=5&atto.articolo.sottoArticolo=1&atto.articolo.sottoArticolo1=10&atto.articolo.flagTipoArticolo=0',
  },
  {
    citazione: 'art. 5, comma 4, D.Lgs. 33/2013',
    contenuto:
      'Il rilascio di dati o documenti in formato elettronico o cartaceo è gratuito, salvo il rimborso del costo effettivamente sostenuto e documentato dall\'amministrazione per la riproduzione su supporti materiali.',
    fonte:
      'https://www.normattiva.it/atto/caricaDettaglioAtto?atto.dataPubblicazioneGazzetta=2013-04-05&atto.codiceRedazionale=13G00076&atto.articolo.numero=5&atto.articolo.sottoArticolo=1&atto.articolo.sottoArticolo1=10&atto.articolo.flagTipoArticolo=0',
  },
  {
    citazione: 'art. 5, comma 5, D.Lgs. 33/2013',
    contenuto:
      'Se individua soggetti controinteressati ai sensi dell\'art. 5-bis, comma 2, l\'amministrazione ne dà loro comunicazione; i controinteressati possono presentare motivata opposizione entro dieci giorni dalla ricezione della comunicazione e, dalla comunicazione, il termine di conclusione del procedimento previsto dal comma 6 è sospeso fino all\'eventuale opposizione dei controinteressati.',
    fonte:
      'https://www.normattiva.it/atto/caricaDettaglioAtto?atto.dataPubblicazioneGazzetta=2013-04-05&atto.codiceRedazionale=13G00076&atto.articolo.numero=5&atto.articolo.sottoArticolo=1&atto.articolo.sottoArticolo1=10&atto.articolo.flagTipoArticolo=0',
  },
  {
    citazione: 'art. 5, comma 6, D.Lgs. 33/2013',
    contenuto:
      'Il procedimento deve concludersi con provvedimento espresso e motivato nel termine di trenta giorni dalla presentazione dell\'istanza, con comunicazione al richiedente e agli eventuali controinteressati; il rifiuto, il differimento e la limitazione dell\'accesso devono essere motivati con riferimento ai casi e ai limiti stabiliti dall\'articolo 5-bis.',
    fonte:
      'https://www.normattiva.it/atto/caricaDettaglioAtto?atto.dataPubblicazioneGazzetta=2013-04-05&atto.codiceRedazionale=13G00076&atto.articolo.numero=5&atto.articolo.sottoArticolo=1&atto.articolo.sottoArticolo1=10&atto.articolo.flagTipoArticolo=0',
  },
  {
    citazione: 'art. 5, comma 7, D.Lgs. 33/2013',
    contenuto:
      'In caso di diniego totale o parziale, oppure di mancata risposta entro il termine di trenta giorni, il richiedente può presentare richiesta di riesame al responsabile della prevenzione della corruzione e della trasparenza, che decide con provvedimento motivato entro venti giorni; se l\'accesso è stato negato o differito a tutela della protezione dei dati personali di cui all\'art. 5-bis, comma 2, lettera a), il responsabile provvede sentito il Garante per la protezione dei dati personali, che si pronuncia entro dieci giorni dalla richiesta, e il termine per l\'adozione del provvedimento di riesame è sospeso fino alla ricezione del parere e comunque per non oltre dieci giorni. Avverso la decisione dell\'amministrazione o del responsabile è ammesso ricorso al Tribunale amministrativo regionale ai sensi dell\'art. 116 del Codice del processo amministrativo.',
    fonte:
      'https://www.normattiva.it/atto/caricaDettaglioAtto?atto.dataPubblicazioneGazzetta=2013-04-05&atto.codiceRedazionale=13G00076&atto.articolo.numero=5&atto.articolo.sottoArticolo=1&atto.articolo.sottoArticolo1=10&atto.articolo.flagTipoArticolo=0',
  },
  {
    citazione: 'art. 5, comma 8, D.Lgs. 33/2013',
    contenuto:
      'Per gli atti delle amministrazioni delle regioni o degli enti locali il richiedente può in alternativa presentare ricorso al difensore civico competente per ambito territoriale, ove costituito; il difensore civico si pronuncia entro trenta giorni e, se ritiene illegittimo il diniego, lo comunica all\'amministrazione, che deve confermarlo entro trenta giorni, altrimenti l\'accesso è consentito. Il criterio è soggettivo — conta quale amministrazione ha adottato l\'atto — e non territoriale: non basta che il fatto si sia svolto in una determinata regione.',
    fonte:
      'https://www.normattiva.it/atto/caricaDettaglioAtto?atto.dataPubblicazioneGazzetta=2013-04-05&atto.codiceRedazionale=13G00076&atto.articolo.numero=5&atto.articolo.sottoArticolo=1&atto.articolo.sottoArticolo1=10&atto.articolo.flagTipoArticolo=0',
  },
  {
    citazione: 'art. 5, comma 11, D.Lgs. 33/2013',
    contenuto:
      'Restano fermi gli obblighi di pubblicazione previsti dal Capo II del decreto e le diverse forme di accesso degli interessati previste dal Capo V della legge 7 agosto 1990, n. 241.',
    fonte:
      'https://www.normattiva.it/atto/caricaDettaglioAtto?atto.dataPubblicazioneGazzetta=2013-04-05&atto.codiceRedazionale=13G00076&atto.articolo.numero=5&atto.articolo.sottoArticolo=1&atto.articolo.sottoArticolo1=10&atto.articolo.flagTipoArticolo=0',
  },
  {
    citazione: 'art. 5-bis, commi 1, 2 e 3, D.Lgs. 33/2013',
    contenuto:
      'L\'accesso civico generalizzato è rifiutato quando è necessario per evitare un pregiudizio concreto a interessi pubblici (fra cui sicurezza, difesa, relazioni internazionali, stabilità economico-finanziaria, conduzione di indagini sui reati e attività ispettive) o a interessi privati, individuati dal comma 2 nella protezione dei dati personali (lettera a), nella libertà e segretezza della corrispondenza (lettera b) e negli interessi economici e commerciali, compresi proprietà intellettuale, diritto d\'autore e segreti commerciali (lettera c); l\'accesso è escluso nei casi di segreto di Stato e negli altri divieti di accesso o divulgazione previsti dalla legge.',
    fonte:
      'https://www.normattiva.it/atto/caricaDettaglioAtto?atto.dataPubblicazioneGazzetta=2013-04-05&atto.codiceRedazionale=13G00076&atto.articolo.numero=5&atto.articolo.sottoArticolo=2&atto.articolo.sottoArticolo1=10&atto.articolo.flagTipoArticolo=1',
  },
  {
    citazione: 'art. 5-bis, comma 4, D.Lgs. 33/2013',
    contenuto:
      'Restano fermi gli obblighi di pubblicazione previsti dalla normativa vigente; se i limiti dei commi 1 e 2 riguardano soltanto alcuni dati o alcune parti del documento richiesto, deve essere consentito l\'accesso agli altri dati o alle altre parti.',
    fonte:
      'https://www.normattiva.it/atto/caricaDettaglioAtto?atto.dataPubblicazioneGazzetta=2013-04-05&atto.codiceRedazionale=13G00076&atto.articolo.numero=5&atto.articolo.sottoArticolo=2&atto.articolo.sottoArticolo1=10&atto.articolo.flagTipoArticolo=1',
  },
  {
    citazione: 'art. 5-bis, comma 5, D.Lgs. 33/2013',
    contenuto:
      'I limiti si applicano solo per il periodo in cui la protezione è giustificata in relazione alla natura del dato; l\'accesso non può essere negato quando è sufficiente fare ricorso al differimento.',
    fonte:
      'https://www.normattiva.it/atto/caricaDettaglioAtto?atto.dataPubblicazioneGazzetta=2013-04-05&atto.codiceRedazionale=13G00076&atto.articolo.numero=5&atto.articolo.sottoArticolo=2&atto.articolo.sottoArticolo1=10&atto.articolo.flagTipoArticolo=1',
  },
  {
    citazione: 'art. 1, comma 1, D.Lgs. 33/2013',
    contenuto:
      'La trasparenza è intesa come accessibilità totale dei dati e documenti detenuti dalle pubbliche amministrazioni, allo scopo di tutelare i diritti dei cittadini, promuovere la partecipazione degli interessati all\'attività amministrativa e favorire forme diffuse di controllo sul perseguimento delle funzioni istituzionali e sull\'utilizzo delle risorse pubbliche.',
    fonte:
      'https://www.normattiva.it/atto/caricaDettaglioAtto?atto.dataPubblicazioneGazzetta=2013-04-05&atto.codiceRedazionale=13G00076&atto.articolo.numero=1&atto.articolo.sottoArticolo=1&atto.articolo.sottoArticolo1=10&atto.articolo.flagTipoArticolo=0',
  },
  {
    citazione: 'art. 2-bis, comma 1, D.Lgs. 33/2013',
    contenuto:
      'La disciplina si applica a tutte le amministrazioni di cui all\'articolo 1, comma 2, del D.Lgs. 30 marzo 2001, n. 165 — elenco che comprende testualmente le amministrazioni, le aziende e gli enti del Servizio sanitario nazionale — comprese le autorità amministrative indipendenti, ed è estesa dai commi successivi a enti pubblici economici, ordini professionali, società in controllo pubblico e altri enti di diritto privato indicati dalla norma.',
    fonte:
      'https://www.normattiva.it/atto/caricaDettaglioAtto?atto.dataPubblicazioneGazzetta=2013-04-05&atto.codiceRedazionale=13G00076&atto.articolo.numero=2&atto.articolo.sottoArticolo=2&atto.articolo.sottoArticolo1=10&atto.articolo.flagTipoArticolo=1',
  },
  {
    citazione: 'art. 43 D.Lgs. 33/2013',
    contenuto:
      'Il responsabile della prevenzione della corruzione svolge di norma le funzioni di responsabile per la trasparenza, vigila sull\'adempimento degli obblighi di pubblicazione e segnala i casi di inadempimento agli organi di indirizzo, all\'organismo indipendente di valutazione, all\'ANAC e, nei casi più gravi, all\'ufficio di disciplina: è la figura davanti alla quale si chiede il riesame ai sensi dell\'art. 5, comma 7, non l\'ufficio a cui si presenta l\'istanza di accesso generalizzato.',
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
    citazione: 'art. 22, comma 1, lett. b), L. 241/1990',
    contenuto:
      'Ai fini dell\'accesso documentale sono «interessati» tutti i soggetti privati, compresi quelli portatori di interessi pubblici o diffusi, che abbiano un interesse diretto, concreto e attuale, corrispondente ad una situazione giuridicamente tutelata e collegata al documento: requisito che l\'accesso civico generalizzato non richiede.',
    fonte:
      'https://www.normattiva.it/atto/caricaDettaglioAtto?atto.dataPubblicazioneGazzetta=1990-08-18&atto.codiceRedazionale=090G0294&atto.articolo.numero=22&atto.articolo.sottoArticolo=1&atto.articolo.sottoArticolo1=10&atto.articolo.flagTipoArticolo=0',
  },
  {
    citazione: 'art. 24, comma 3, L. 241/1990',
    contenuto:
      'Non sono ammissibili istanze di accesso preordinate ad un controllo generalizzato dell\'operato delle pubbliche amministrazioni: limite dettato per l\'accesso documentale del Capo V, non per l\'accesso civico generalizzato dell\'art. 5, comma 2, del D.Lgs. 33/2013.',
    fonte:
      'https://www.normattiva.it/atto/caricaDettaglioAtto?atto.dataPubblicazioneGazzetta=1990-08-18&atto.codiceRedazionale=090G0294&atto.articolo.numero=24&atto.articolo.sottoArticolo=1&atto.articolo.sottoArticolo1=10&atto.articolo.flagTipoArticolo=0',
  },
  {
    citazione: 'art. 25, commi 2 e 4, L. 241/1990',
    contenuto:
      'Nell\'accesso documentale la richiesta deve essere motivata ed essere rivolta all\'amministrazione che ha formato il documento o che lo detiene stabilmente; decorsi inutilmente trenta giorni dalla richiesta, questa si intende respinta e, contro gli atti delle amministrazioni comunali, provinciali e regionali, il richiedente può chiedere il riesame al difensore civico competente per ambito territoriale.',
    fonte:
      'https://www.normattiva.it/atto/caricaDettaglioAtto?atto.dataPubblicazioneGazzetta=1990-08-18&atto.codiceRedazionale=090G0294&atto.articolo.numero=25&atto.articolo.sottoArticolo=1&atto.articolo.sottoArticolo1=10&atto.articolo.flagTipoArticolo=0',
  },
  {
    citazione: 'art. 116, comma 1, D.Lgs. 104/2010 (Codice del processo amministrativo)',
    contenuto:
      'Il ricorso contro le determinazioni e contro il silenzio sulle istanze di accesso ai documenti amministrativi, nonché per la tutela del diritto di accesso civico connessa all\'inadempimento degli obblighi di trasparenza, si propone entro trenta giorni dalla conoscenza della determinazione impugnata o dalla formazione del silenzio, mediante notificazione all\'amministrazione e ad almeno un controinteressato.',
    fonte:
      'https://www.gazzettaufficiale.it/atto/serie_generale/caricaArticolo?art.versione=3&art.idGruppo=32&art.flagTipoArticolo=2&art.codiceRedazionale=010G0127&art.idArticolo=116&art.idSottoArticolo=1&art.idSottoArticolo1=10&art.dataPubblicazioneGazzetta=2010-07-07&art.progressivo=0',
  },
]

/**
 * Le citazioni nella forma «[3] 18 luglio 2026: testo».
 *
 * Il luogo NON viene passato al modello. `SegnalazioneCitabile.luogo` arriva da
 * `reports.location_hint`, che il triage estrae dal testo grezzo e che quindi
 * contiene numeri civici, nomi di scuole e di presidi: è escluso dalle viste
 * pubbliche e viene azzerato quando un cittadino cancella l'account. Stamparlo
 * in un atto diretto alla PA — e nella pagina pubblica del dossier — lo
 * riporterebbe in circolazione per sempre. L'unico riferimento geografico
 * dell'atto è il comune (e il quartiere) del gruppo.
 */
function formattaCitazioni(citazioni: SegnalazioneCitabile[]): string {
  return citazioni.map((c) => `[${c.indice}] ${c.data}: ${c.testo}`).join('\n')
}

/** L'elenco chiuso delle norme citabili, come lo vede il modello. */
function formattaRiferimenti(riferimenti: RiferimentoNormativo[]): string {
  return riferimenti.map((r) => `- ${r.citazione}: ${r.contenuto}`).join('\n')
}

/** «Milano, quartiere Corvetto» oppure «Milano». */
function formattaLuogo(cluster: ContestoAtto['cluster']): string {
  return cluster.quartiere ? `${cluster.citta}, quartiere ${cluster.quartiere}` : cluster.citta
}

const ISTRUZIONI_SPECIFICHE = `---

ATTO DA REDIGERE: ISTANZA DI ACCESSO CIVICO GENERALIZZATO
(art. 5, comma 2, D.Lgs. 14 marzo 2013, n. 33)

CHE COSA STAI SCRIVENDO
Una richiesta di dati e documenti a un'amministrazione pubblica. Non è un
esposto, non è una diffida, non è una denuncia: non chiede provvedimenti, non
attribuisce responsabilità, non ipotizza illeciti. Chiede carte. È l'atto più
efficace che questi cittadini possano firmare proprio perché domanda una cosa
che l'amministrazione ha l'obbligo di dare, e perché il rifiuto va motivato per
iscritto entro un termine.

CHI RICEVE QUESTO ATTO CONOSCE GIÀ LE PERSONE DI CUI PARLI
Questa è la regola che viene prima di tutte le altre.
L'atto arriva all'ente che detiene i registri di accesso, le cartelle, i turni.
Per lui una data singola unita a un dettaglio individuale non è una
circostanza: è un nome. «Il 25 luglio, un minore con febbre alta, cinque ore di
attesa» individua una persona sola — e con lei il familiare che ha segnalato.
Consegnare all'ente criticato il dato sanitario di un paziente è il danno più
grave che questo atto possa produrre, e lo produce contro le stesse persone che
lo hanno reso possibile.

Quindi, nelle premesse e ovunque nell'atto:
  - MAI la coppia «data singola + dettaglio della persona». Sono dettagli della
    persona: la condizione clinica o il sintomo, la diagnosi, il motivo
    dell'accesso o della richiesta, l'età, l'essere minore o anziano, il ruolo
    familiare (figlio, madre, coniuge), il sesso, la professione, la
    disabilità, la nazionalità.
  - Le circostanze che si contano si scrivono aggregate, senza date singole:
    «N segnalazioni riferiscono attese pari o superiori a sei ore [1][2][4]».
  - Le circostanze qualitative si scrivono senza la persona che le ha subite:
    non «la permanenza notturna di una persona su una barella collocata in
    corridoio [3]», ma «una segnalazione riferisce la collocazione di pazienti
    su barelle in corridoio [3]».
  - Le date singole compaiono solo per delimitare l'arco temporale complessivo
    (la prima e l'ultima segnalazione richiamate), mai accostate a un episodio
    individuale.
  - Se una circostanza non si può scrivere senza il dettaglio individuale, si
    toglie. Nessuna circostanza vale l'identificazione di chi l'ha subita.
Vale allo stesso modo per tutte le segnalazioni richiamate: non è ammesso
descrivere alcune in forma aggregata e altre per episodio.

IL LUOGO: SOLO QUELLO DEL GRUPPO
L'unico riferimento geografico utilizzabile è quello indicato nel materiale
come luogo del gruppo (comune ed eventuale quartiere).
  - Non ricavare dal testo delle segnalazioni e non riportare nell'atto vie,
    numeri civici, denominazioni di scuole, presidi, reparti, fermate o altri
    punti di riferimento: identificano l'abitazione o il luogo di lavoro di chi
    ha scritto.
  - Il comune e il quartiere del gruppo dicono da dove provengono i cittadini,
    non dove si trova la struttura. Non scrivere mai «il pronto soccorso di
    zona Corvetto». Scrivi: «segnalazioni provenienti da cittadini di Milano,
    zona Corvetto, riferite a [DA COMPLETARE: denominazione e sede della
    struttura o del servizio]».
  - La denominazione della struttura è sempre un segnaposto, salvo che sia
    contenuta nel blocco DESTINATARIO del materiale.

CHI PRESENTA L'ISTANZA
La parte del procedimento è una sola: chi sottoscrive. Solo lui riceve il
riscontro, solo lui può chiedere il riesame e ricorrere al giudice
amministrativo. Le firme raccolte sono un sostegno pubblico e non attribuiscono
a nessuno la qualità di parte.
  - L'istanza è presentata dal solo sottoscrittore. Vietate le formule «anche a
    nome di», «per conto di», «in rappresentanza di», «unitamente ai cittadini
    firmatari».
  - Non allegare, non annunciare e non menzionare alcun elenco di sottoscrittori
    o di segnalanti: l'art. 5, comma 3, esclude ogni limite di legittimazione
    soggettiva, quindi quell'elenco non serve all'istanza e servirebbe soltanto
    a consegnare all'ente criticato i nomi di chi lo ha criticato.
  - Non indicare un numero di firme raccolte: quando l'atto viene redatto non
    ne esiste ancora nessuna.
  - Scrivi invece, nelle premesse, una frase in questa sostanza: «I dati
    identificativi dei cittadini che hanno inviato le segnalazioni non sono
    trasmessi con la presente istanza.»

LA REGOLA CHE DECIDE SE L'ISTANZA VIENE ACCOLTA O CESTINATA
Ogni documento richiesto deve essere DETERMINATO. Una richiesta generica o
esplorativa — «tutta la documentazione relativa al problema» — viene respinta,
e si porta dietro anche le voci scritte bene.
Costruisci ogni voce con quattro elementi:
  1. che cosa: il tipo di documento o di dato;
  2. su che cosa: l'oggetto preciso (struttura, servizio, procedimento);
  3. per quale periodo: date determinate;
  4. presso chi: l'ufficio o la struttura che lo detiene, se ricavabile.
Sono vietate le formule «tutta la documentazione relativa a», «ogni atto
riguardante», «ogni informazione utile», «lo stato della situazione».
Se non conosci la denominazione ufficiale di un atto, descrivilo per contenuto
e funzione — «il documento, comunque denominato, che disciplina…» — e non
inventare titoli, numeri di protocollo, date di adozione o denominazioni di
uffici.

QUANTE VOCI
Da tre a otto voci numerate. Meno di tre è un'istanza debole; più di otto
espone al rilievo di richiesta massiva e manifestamente irragionevole, e fa
perdere anche le voci buone.
Ogni voce si chiude con il collegamento ai fatti, nella forma: «Il dato è
richiesto in relazione a quanto riferito in [1][3][5]». Se una voce non è
collegabile ad almeno una segnalazione, togli quella voce.

DATI PERSONALI: PREVIENI IL DINIEGO E NON CAUSARE IL DANNO
Il rischio è doppio: una richiesta troppo fine viene respinta ai sensi
dell'art. 5-bis, comma 2, lettera a), e se invece viene accolta produce un dato
che identifica una persona sola — dato che finisce nella pagina pubblica del
dossier.
Regole di granularità, da rispettare voce per voce:
  - base temporale minima mensile. Mai un dato a granularità giornaliera su
    eventi rari (per esempio le permanenze oltre le ventiquattro ore);
  - ogni distribuzione, classificazione o conteggio per classi si chiede con la
    clausola «con soppressione o accorpamento delle classi che contano meno di
    cinque unità»;
  - la dotazione di personale si chiede come media per fascia oraria e per
    profilo professionale su base mensile, mai per singolo turno: «un medico e
    due infermieri nel turno notturno» identifica tre persone;
  - mai atti sanitari individuali, nominativi di utenti o di dipendenti, turni
    riferiti a persone identificate, immagini di videosorveglianza.
Regole sui documenti:
  - ogni voce che chiede un atto, un verbale, una relazione o della
    corrispondenza si chiude anche con «con oscuramento dei nominativi e degli
    altri dati personali eventualmente contenuti»;
  - aggiungi sempre che, ove una parte dei documenti contenga dati sottratti
    all'accesso, si chiede l'accesso alle restanti parti.
CONTROLLO DI COERENZA, da fare prima di scrivere le «Precisazioni»:
  - se TUTTE le voci chiedono dati numerici aggregati, allora e solo allora
    puoi scrivere che «i dati sono richiesti in forma aggregata e priva di
    elementi identificativi»;
  - se anche una sola voce chiede un documento, quella frase è falsa: scrivi
    invece che «i dati numerici sono richiesti in forma aggregata e i documenti
    sono richiesti con oscuramento dei dati personali eventualmente
    contenuti».
Non scrivere mai che le segnalazioni richiamate «non contengono dati
identificativi»: non puoi verificarlo. Scrivi al più l'impegno che ti riguarda:
«le circostanze sono riportate senza elementi identificativi delle persone
coinvolte».

PERIODO TEMPORALE
Ricavalo dalle date delle segnalazioni, non altrove:
  - inizio: il primo giorno del mese in cui ricade la segnalazione più remota
    fra quelle richiamate;
  - fine: la data di ricezione dell'istanza;
  - estensione retroattiva: solo se ALMENO DUE segnalazioni riferiscono che il
    fenomeno dura da tempo, e solo per le voci che chiedono dati numerici
    aggregati, puoi risalire al 1° gennaio dell'anno in cui ricade la
    segnalazione più recente. Con una sola segnalazione che lo riferisce non si
    estende nulla: si chiede il periodo ordinario e la persistenza si menziona
    come circostanza riferita da una segnalazione.
Il criterio va scritto dentro l'atto: l'amministrazione deve poter capire
perché quel periodo e non un altro. Non usare mai date che non derivano da
questo calcolo.
L'oggetto deve riportare il periodo esattamente come risulta dal corpo. Se
l'estensione retroattiva riguarda solo alcune voci, l'oggetto lo dice:
«periodo 1° luglio 2026 – data di ricezione; per i soli dati aggregati, dal
1° gennaio 2026». Oggetto e corpo che indicano periodi diversi sono un difetto
visibile a colpo d'occhio.

STRUTTURA (esattamente queste sezioni, in quest'ordine)
1. Titolo di primo livello: «Richiesta di accesso civico generalizzato», e
   sotto, su una riga, la base normativa.
2. Blocco di intestazione con «Destinatario:» e «Oggetto:». L'oggetto sta in
   una riga e nomina la materia, il luogo e il periodo.
3. Formula di apertura: «Il/La sottoscritto/a [DA COMPLETARE: nome, cognome,
   luogo e data di nascita, residenza, codice fiscale, recapito]», che presenta
   l'istanza in proprio. Nessun riferimento a mandati, deleghe o cofirmatari.
4. «Premesso che»: i fatti e i numeri. Un capoverso per circostanza, ciascuno
   chiuso dai riferimenti [n]. Il primo capoverso riporta i numeri del gruppo
   con questa formula, adattata ai valori del materiale: «N segnalazioni
   raccolte da M cittadini distinti; K sono richiamate nella presente istanza e
   sono le uniche da cui derivano le circostanze descritte». Non attribuire mai
   alle segnalazioni non richiamate un contenuto che non hai letto. Segue
   l'arco di date coperto dalle segnalazioni richiamate.
5. «Considerato che»: perché quei documenti si chiedono e a che titolo. Qui
   citi la base normativa dell'istanza.
6. «Tutto ciò premesso, chiede»: la frase di richiesta con il richiamo
   all'art. 5, comma 2, del D.Lgs. 33/2013 e l'elenco numerato dei documenti.
7. «Precisazioni sull'istanza»: natura di accesso civico generalizzato e non
   di accesso documentale, assenza dell'onere di motivazione, granularità dei
   dati secondo il controllo di coerenza, accesso parziale, gratuità, modalità
   e recapito per il riscontro, disponibilità a circoscrivere l'oggetto in caso
   di difficoltà di estrazione.
8. «Termini e rimedi». Tono informativo, non intimidatorio: si «rammenta», non
   si minaccia. Contiene, in quest'ordine:
   - il termine di trenta giorni e l'obbligo di provvedimento espresso e
     motivato, anche per rifiuto, differimento e limitazione (art. 5, c. 6);
   - la sospensione in caso di controinteressati, indicando il tetto: il
     termine è sospeso fino all'eventuale opposizione, che i controinteressati
     possono presentare entro dieci giorni dalla ricezione della comunicazione
     (art. 5, c. 5). Non scrivere «per il tempo previsto dal comma 5»: è una
     frase che non indica alcun tempo;
   - il riesame davanti al responsabile della prevenzione della corruzione e
     della trasparenza, che decide entro venti giorni, precisando che se il
     diniego è fondato sulla protezione dei dati personali (art. 5-bis, c. 2,
     lett. a) il responsabile provvede sentito il Garante, che si pronuncia
     entro dieci giorni, e che il termine per il riesame è sospeso fino alla
     ricezione del parere e comunque per non oltre dieci giorni (art. 5, c. 7).
     Questa precisazione va sempre scritta: è proprio l'ipotesi in cui questa
     istanza rischia di cadere;
   - il ricorso al TAR entro trenta giorni (art. 116, c. 1, c.p.a.);
   - il difensore civico SOLO alle condizioni indicate più sotto.
9. Blocco di chiusura: «Luogo e data», «Firma», «Allegati». Fra gli allegati
   non compare alcun elenco di sottoscrittori e nessun documento che non sia
   stato effettivamente predisposto: scrivi «Allegati: [DA COMPLETARE:
   eventuali allegati; se non ve ne sono, indicare «nessuno»]».
10. Note per la revisione, racchiuse fra i due marcatori
    ${NOTE_REVISIONE_INIZIO} e ${NOTE_REVISIONE_FINE}, ciascuno su una riga
    propria. Sono l'ultima cosa che scrivi. Non sono parte dell'atto: servono a
    chi revisiona, e contengono soltanto l'elenco dei segnaposto rimasti e dei
    controlli da fare. Non scrivere lì dentro valutazioni sulla solidità o
    sulla debolezza dell'istanza, ipotesi su come l'amministrazione potrebbe
    replicare, o proposte di togliere parti dell'atto: quelle note sono
    leggibili anche da chi riceverà l'atto. I controlli sempre presenti sono:
    la scelta dell'ufficio destinatario fra quelli ammessi, la denominazione e
    la sede della struttura interessata, la natura giuridica dell'ente
    destinatario ai fini del rimedio del difensore civico e i dati del
    richiedente.

IL DIFENSORE CIVICO: CONDIZIONI PER NOMINARLO
La facoltà di ricorso dell'art. 5, comma 8, dipende da CHI ha adottato l'atto —
«le amministrazioni delle regioni o degli enti locali» — e non dal territorio
in cui il fatto è avvenuto. È vietata qualunque parafrasi del tipo «atti
riferiti all'ambito regionale» o «trattandosi di materia regionale».
  - Se il destinatario è un segnaposto, non scrivere affatto il rimedio: non
    puoi sapere se l'ente rientri in quella categoria. Scrivi al suo posto
    «[DA COMPLETARE: verificare se l'ente destinatario è un'amministrazione
    della regione o di un ente locale, se il difensore civico competente per
    ambito territoriale è costituito e con quale denominazione]».
  - Se il destinatario è noto e rientra nella categoria, scrivi: «ove costituito
    il difensore civico competente per ambito territoriale, resta ferma la
    facoltà di ricorso ai sensi dell'art. 5, comma 8, del D.Lgs. 33/2013». Il
    qualificatore «ove costituito» non si omette mai: un cittadino che si
    affida a un organo inesistente perde i trenta giorni per il ricorso al TAR.

CIRCOSTANZE: SOLO QUELLO CHE C'È SCRITTO
  - Non specificare fra quali due momenti è misurata una durata se la
    segnalazione non lo dice. Scrivi «le segnalazioni non precisano fra quali
    momenti l'attesa sia stata misurata». Puoi comunque chiedere l'indicatore
    ufficiale nell'elenco, ma senza presentarlo come il dato riferito dai
    cittadini.
  - Non estendere ad altre persone ciò che una segnalazione riferisce di chi
    scrive. Se una segnalazione dice «sei ore in piedi, sala d'attesa piena,
    molte persone anziane», si scrive esattamente questo e non «diverse persone
    anziane sono rimaste in piedi».
  - Non fondere due segnalazioni in una circostanza sola: se dicono cose
    diverse, sono due capoversi.

REGISTRO
Italiano amministrativo, impersonale, asciutto. I verbi sono «risulta»,
«è riferito», «le segnalazioni riferiscono», «si chiede», «si rammenta».
Nessun aggettivo di giudizio («grave», «inaccettabile», «vergognoso»), nessuna
ipotesi di responsabilità, nessuna richiesta di intervento sul servizio: questa
è una richiesta di documenti e la sua forza sta nelle date e nei numeri.
Lunghezza complessiva fra 600 e 1000 parole.

COSA NON FARE, MAI
- Non chiedere «tutta la documentazione», «ogni atto», «notizie sul problema».
- Non chiedere provvedimenti, interventi, scuse, sanzioni o l'accertamento di
  responsabilità: non è la sede, e trasforma un'istanza dovuta in un atto
  discrezionale.
- Non affermare che l'amministrazione ha violato una norma o omesso un atto.
- Non nominare strutture, uffici o presidi di cui non conosci la denominazione
  esatta: usa un segnaposto fra parentesi quadre.
- Non raccontare episodi individuali, né chiedere dati personali, sanitari o
  riferiti a persone identificabili.
- Non riportare vie, numeri civici o denominazioni tratte dal testo delle
  segnalazioni.
- Non citare norme che non sono nell'elenco fornito e non usare citazioni
  aperte: «artt. 22 e seguenti», «e ss.», «la normativa in materia» non sono
  citazioni, sono rinvii che nessuno ha verificato.
- Non affermare obblighi di forma o di allegazione (documenti di identità,
  marche da bollo, moduli) che non risultino dall'elenco dei riferimenti.
- Non calcolare medie, percentuali o proiezioni: conta le segnalazioni.
- Non scrivere la sezione «Segnalazioni richiamate» e non scrivere un elenco
  finale dei riferimenti normativi: li aggiunge l'applicazione, e una seconda
  copia scritta da te produce due liste divergenti nello stesso atto.
- Non riportare il testo delle segnalazioni.
- Non scrivere il disclaimer sull'origine automatica della bozza: lo aggiunge
  l'applicazione, e una seconda copia scritta da te lo rende incoerente.
- Non inventare allegati, protocolli, PEC o indirizzi.

CAMPI OBBLIGATORI: senza anche uno solo di questi l'atto è incompleto e viene
scartato prima della revisione.
  1. destinatario (o il segnaposto, se non è noto);
  2. oggetto in una riga, con materia, luogo e periodo, coerente con il corpo;
  3. formula di sottoscrizione in proprio, con i segnaposto dei dati del
     richiedente;
  4. richiamo espresso all'art. 5, comma 2, del D.Lgs. 33/2013 nella richiesta;
  5. i tre numeri del gruppo nella formula prescritta: segnalazioni raccolte,
     cittadini distinti, segnalazioni richiamate;
  6. periodo temporale determinato, con il criterio dichiarato;
  7. elenco numerato da tre a otto documenti, ciascuno determinato, con la
     clausola di granularità o di oscuramento che gli compete e collegato ai
     riferimenti [n];
  8. dichiarazione sulla granularità dei dati coerente con l'elenco e richiesta
     di accesso parziale;
  9. frase sulla non trasmissione dei dati identificativi dei segnalanti;
 10. modalità e recapito per il riscontro (con segnaposto);
 11. termine di conclusione del procedimento, sospensione con il tetto dei
     dieci giorni, riesame con il passaggio davanti al Garante, ricorso al TAR;
 12. luogo, data, firma e allegati;
 13. note per la revisione racchiuse fra i due marcatori.`

const SYSTEM_PROMPT = `${REGOLE_COMUNI}

${ISTRUZIONI_SPECIFICHE}`

/**
 * Modello dell'accesso civico generalizzato.
 *
 * `ruoloDestinatario` è «urp» e non «trasparenza»: l'art. 5, comma 3, ammette
 * il responsabile della prevenzione della corruzione e della trasparenza come
 * destinatario dell'istanza soltanto alla lettera d), cioè quando l'istanza ha
 * per oggetto dati soggetti a pubblicazione obbligatoria. L'accesso
 * generalizzato riguarda per definizione dati ulteriori, quindi restano solo
 * l'ufficio che detiene i dati, l'URP e l'ufficio indicato in «Amministrazione
 * trasparente» (scheda ANAC sull'accesso generalizzato). In più il responsabile
 * è l'organo del riesame ex art. 5, comma 7: indirizzargli l'istanza
 * significherebbe far riesaminare il diniego a chi lo ha adottato.
 *
 * `firmeObiettivo` è 30 (PLAN.md §5.4). Le firme danno peso pubblico alla
 * richiesta: non vengono trasmesse all'amministrazione, non compaiono nel
 * corpo dell'atto e non attribuiscono a chi le appone la qualità di parte del
 * procedimento — quella resta del solo sottoscrittore.
 */
export const accessoCivico: ModelloAtto = {
  kind: 'accesso_civico',
  ruoloDestinatario: 'urp',
  firmeObiettivo: 30,

  titolo: (ctx) =>
    `Accesso civico generalizzato — ${ctx.cluster.titolo} (${ctx.cluster.citta})`,

  systemPrompt: SYSTEM_PROMPT,

  userPrompt: (ctx) => {
    const { cluster, citazioni, destinatario } = ctx

    const bloccoDestinatario = destinatario
      ? `${destinatario}\n` +
        'Usa questo destinatario alla lettera: proviene dall\'elenco verificato dei contatti della pubblica amministrazione.\n' +
        'Fra le note per la revisione chiedi comunque di confermare che l\'ufficio sia fra quelli ammessi dall\'art. 5, comma 3, lettere a), b) e c).'
      : 'Nessun contatto verificato disponibile per questa amministrazione.\n' +
        'Scrivi come destinatario il segnaposto [DA COMPLETARE: amministrazione destinataria e ufficio a cui trasmettere l\'istanza — ufficio che detiene i dati, Ufficio relazioni con il pubblico oppure ufficio indicato nella sezione «Amministrazione trasparente»; non il responsabile della prevenzione della corruzione e della trasparenza, che per questa istanza è l\'organo del riesame], seguito da [DA COMPLETARE: indirizzo PEC].\n' +
        'Ripeti l\'avvertenza fra le note per la revisione. Non dedurre e non inventare un ente, un ufficio o un indirizzo.\n' +
        'Finché il destinatario è un segnaposto non scrivere nessuna affermazione che dipenda dalla sua natura giuridica: né il rimedio del difensore civico, né la qualificazione dell\'ente.'

    return `MATERIALE PER L'ISTANZA

GRUPPO DI SEGNALAZIONI
Titolo: ${cluster.titolo}
Riassunto: ${cluster.riassunto}
Categoria: ${cluster.categoria}
Provenienza dei cittadini che hanno segnalato: ${formattaLuogo(cluster)}
(è la zona da cui scrivono, non la sede della struttura interessata)
Segnalazioni raccolte nel gruppo: ${cluster.segnalazioni}
Cittadini distinti che le hanno inviate: ${cluster.cittadini}
Segnalazioni richiamate qui sotto: ${citazioni.length}

DESTINATARIO
${bloccoDestinatario}

SEGNALAZIONI RICHIAMABILI
Usa questi numeri così come sono, non rinumerarli e non citarne altri.
Sono le uniche segnalazioni che hai letto: alle altre del gruppo non puoi
attribuire alcun contenuto.
Non contengono il luogo: non ricostruirlo e non chiederlo al lettore.
${formattaCitazioni(citazioni)}

RIFERIMENTI NORMATIVI DISPONIBILI
Sono gli unici citabili. Il fondamento dell'istanza è l'art. 5, comma 2, del
D.Lgs. 33/2013; i riferimenti alla L. 241/1990 servono soltanto, nelle
«Precisazioni sull'istanza», a chiarire che questa non è una richiesta di
accesso documentale e che quindi non deve essere motivata.
${formattaRiferimenti(RIFERIMENTI)}

COMPITO
Scrivi l'istanza di accesso civico generalizzato seguendo la struttura, i campi
obbligatori e i divieti che ti sono stati dati.
I documenti da chiedere li scegli tu, ma ciascuno deve essere determinato,
detenuto con ogni probabilità dall'amministrazione destinataria in ragione
delle sue funzioni, richiesto a una granularità che non isoli una persona, e
collegato ad almeno una delle segnalazioni richiamate.
Quando i fatti non bastano a determinare un elemento — la denominazione esatta
di una struttura, l'ufficio competente, un recapito — lascia un segnaposto fra
parentesi quadre e annotalo fra le note per la revisione.`
  },

  riferimenti: RIFERIMENTI,

  /**
   * Trenta giorni, dall'art. 5, comma 6, già nell'elenco qui sopra: «il
   * procedimento deve concludersi con provvedimento espresso e motivato nel
   * termine di trenta giorni dalla presentazione dell'istanza».
   *
   * La sospensione dell'art. 5, comma 5, è scritta dentro `base` e non tolta
   * dal conteggio: la piattaforma non sa se l'amministrazione abbia individuato
   * dei controinteressati, e dedurlo sarebbe inventare. Chi revisiona il
   * sollecito legge la clausola nel `deadline_basis` dell'atto e verifica prima
   * di firmare — è per questo che la clausola sta lì e non in un commento.
   */
  termine: {
    giorni: 30,
    base:
      'art. 5, comma 6, D.Lgs. 33/2013 — 30 giorni dalla presentazione ' +
      'dell\'istanza; il termine è sospeso, ai sensi dell\'art. 5, comma 5, in ' +
      'caso di comunicazione ai controinteressati',
  },
}
