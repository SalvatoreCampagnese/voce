/**
 * Esposto alla Procura della Repubblica.
 *
 * È l'atto con la posta più alta prodotto dal servizio: si rivolge all'autorità
 * giudiziaria e, se scritto male, non viene soltanto cestinato — espone chi lo
 * firma. Le scelte redazionali che reggono tutto il file:
 *
 * 1. L'atto NON qualifica il reato. Espone fatti e chiede al pubblico ministero
 *    di valutare se costituiscano reato. La qualificazione giuridica spetta al
 *    magistrato, non a chi scrive.
 * 2. L'atto NON è una querela. Chi ha firmato ha aderito a un esposto: non ha
 *    manifestato la volontà che si proceda contro qualcuno (art. 336 c.p.p.).
 *    Attribuirgliela sarebbe un falso, per giunta con un termine di decadenza
 *    che nessuno ha scelto di far decorrere (art. 124 c.p.).
 * 3. L'atto NON trasmette all'autorità giudiziaria alcun elenco nominativo.
 *    L'art. 333, comma 2, c.p.p. richiede una sola sottoscrizione, quella del
 *    denunciante: una denuncia firmata da una persona identificata non è
 *    anonima, qualunque cosa contengano gli allegati. Finché la piattaforma non
 *    verifica l'identità di chi firma online e non raccoglie un consenso
 *    specifico e revocabile alla trasmissione all'AG, i cittadini che
 *    sostengono l'atto compaiono come numero e non come elenco di nomi.
 * 4. Il corpo dell'atto è pubblico. Le persone descritte nelle segnalazioni —
 *    un familiare, un minore — non hanno acconsentito a comparirvi: il
 *    dettaglio clinico e le date puntuali restano fuori dal corpo.
 *
 * I riferimenti di `REFERENCE_CATALOG` sono stati verificati uno per uno su
 * Normattiva il 4 agosto 2026, con l'endpoint `caricaDettaglioAtto` e il numero
 * di articolo (il permalink URN restituisce solo l'indice dell'atto). Gli URL
 * del campo `fonte` sono quelli effettivamente consultati.
 *
 * Normattiva non espone via HTTP i singoli articoli del codice penale: l'art.
 * 328 c.p. è stato verificato sull'art. 16 della L. 26 aprile 1990 n. 86, che
 * lo ha sostituito ed è pubblicato per esteso.
 *
 * Due riferimenti sono stati rimossi dal catalogo, e la rimozione è
 * deliberata — non è una dimenticanza:
 *  - art. 40, comma 2, c.p.: è una clausola generale di equivalenza causale,
 *    non una norma incriminatrice. Funziona solo insieme a una fattispecie
 *    della parte speciale, che il §F vieta di citare. Citarlo da solo non ha
 *    alcuna funzione e lascia dedurre al lettore il reato omissivo che il §B
 *    esiste per non affermare.
 *  - art. 32 Cost.: esiste ed è vigente, ma non definisce reati e non fonda
 *    nessuna delle richieste finali. In un esposto penale, collocato dopo
 *    l'elenco dei fatti, si legge inevitabilmente come accusa di violazione di
 *    un diritto. L'interesse dei cittadini è già dimostrato dai fatti.
 */

import { DISCLAIMER_AI, REGOLE_COMUNI } from './tipi'
import type {
  ContestoAtto,
  ModelloAtto,
  RiferimentoNormativo,
  SegnalazioneCitabile,
} from './tipi'

/**
 * Un riferimento verificato più le condizioni alle quali può comparire
 * nell'atto.
 *
 * Il vincolo d'uso non è un dettaglio di stile: `art. 328 c.p.` senza una
 * richiesta scritta rimasta senza risposta è una citazione che il magistrato
 * legge come pretestuosa. Meglio pochi articoli esatti che un elenco
 * decorativo.
 */
interface UsableReference {
  reference: RiferimentoNormativo
  /** Quando e in che forma il riferimento può entrare nell'atto. */
  usage: string
  /**
   * `true` quando il riferimento entra nell'atto solo se ricorre la condizione
   * descritta in `usage`.
   *
   * Serve a tenerlo fuori dall'appendice «Riferimenti normativi» che
   * `componiAtto` stampa in fondo al documento: quell'appendice non conosce le
   * condizioni d'uso, e un articolo che il testo dichiara di non richiamare non
   * può ricomparire due righe più sotto sotto forma di elenco. L'atto
   * accuserebbe dopo aver scritto di non accusare.
   */
  conditional?: boolean
}

const REFERENCE_CATALOG: readonly UsableReference[] = [
  {
    reference: {
      citazione: 'art. 333, commi 1 e 2, c.p.p.',
      contenuto:
        "Ogni persona che ha notizia di un reato perseguibile di ufficio può farne " +
        'denuncia; la legge determina i casi in cui la denuncia è obbligatoria. La ' +
        'denuncia è presentata oralmente o per iscritto, personalmente o a mezzo di ' +
        'procuratore speciale, al pubblico ministero o a un ufficiale di polizia ' +
        'giudiziaria; se è presentata per iscritto, è sottoscritta dal denunciante o ' +
        'da un suo procuratore speciale.',
      fonte:
        'https://www.normattiva.it/atto/caricaDettaglioAtto?atto.dataPubblicazioneGazzetta=1988-10-24&atto.codiceRedazionale=088G0492&atto.articolo.numero=333&atto.articolo.sottoArticolo=1&atto.articolo.sottoArticolo1=10&atto.articolo.flagTipoArticolo=0',
    },
    // Il comma 3 («delle denunce anonime non può essere fatto alcun uso, salvo
    // quanto disposto dall'articolo 240») è deliberatamente fuori da `contenuto`:
    // non è la norma su cui questo atto si fonda, e riportarlo amputato della
    // sua eccezione trasformava una regola relativa in un divieto assoluto, dal
    // quale si era dedotto un obbligo di allegare i dati identificativi dei
    // sottoscrittori che la norma non impone.
    usage:
      "nell'oggetto e nella riga di chiusura, come base della presentazione " +
      "dell'atto. Il comma 2 richiede una sola sottoscrizione, quella del " +
      'denunciante o del suo procuratore speciale: la firma di chi presenta l\'atto ' +
      "basta a soddisfare la legge. Non dedurne alcun obbligo di allegare l'elenco " +
      'o i dati di altre persone.',
  },
  {
    reference: {
      citazione: 'art. 328, comma 2, c.p.',
      // La multa è espressa in lire nel testo sostitutivo del 1990: l'importo è
      // omesso perché irrilevante per questo atto e fuorviante se riportato.
      contenuto:
        'Fuori dei casi previsti dal primo comma, il pubblico ufficiale o ' +
        "l'incaricato di un pubblico servizio, che entro trenta giorni dalla " +
        "richiesta di chi vi abbia interesse non compie l'atto del suo ufficio e non " +
        'risponde per esporre le ragioni del ritardo, è punito con la reclusione fino ' +
        'ad un anno o con la multa; tale richiesta deve essere redatta in forma ' +
        'scritta e il termine di trenta giorni decorre dalla ricezione della ' +
        'richiesta stessa.',
      fonte:
        'https://www.normattiva.it/atto/caricaDettaglioAtto?atto.dataPubblicazioneGazzetta=1990-04-27&atto.codiceRedazionale=090G0110&atto.articolo.numero=16&atto.articolo.sottoArticolo=1&atto.articolo.sottoArticolo1=10&atto.articolo.flagTipoArticolo=0',
    },
    usage:
      'SOLO SE almeno una delle segnalazioni richiamate riferisce espressamente una ' +
      "richiesta scritta rivolta all'amministrazione e rimasta senza riscontro. In " +
      'quel caso può comparire una sola volta e in forma dubitativa («perché sia ' +
      'valutato anche in relazione a…»). Se le segnalazioni non parlano di una ' +
      "richiesta scritta, il riferimento NON entra nell'atto.",
    conditional: true,
  },
  {
    reference: {
      citazione: 'art. 90, comma 1-bis, c.p.p.',
      contenuto:
        'La persona offesa ha facoltà di dichiarare o eleggere domicilio. Ai fini ' +
        'della dichiarazione di domicilio la persona offesa può indicare un indirizzo ' +
        'di posta elettronica certificata o altro servizio elettronico di recapito ' +
        'certificato qualificato.',
      fonte:
        'https://www.normattiva.it/atto/caricaDettaglioAtto?atto.dataPubblicazioneGazzetta=1988-10-24&atto.codiceRedazionale=088G0492&atto.articolo.numero=90&atto.articolo.sottoArticolo=1&atto.articolo.sottoArticolo1=10&atto.articolo.flagTipoArticolo=0',
    },
    usage:
      'nella parte finale, prima delle richieste di informazioni, subordinato alla ' +
      "qualità di persona offesa: dichiarazione o elezione di domicilio, con il " +
      'segnaposto [DA COMPLETARE: domicilio o indirizzo di posta elettronica ' +
      'certificata per le notificazioni]. Senza un domicilio dichiarato le richieste ' +
      "che seguono restano lettera morta: l'ufficio non ha dove notificare.",
  },
  {
    reference: {
      citazione: 'art. 408, commi 2, 3 e 3-bis, c.p.p.',
      contenuto:
        'Fuori dei casi di rimessione della querela, l\'avviso della richiesta di ' +
        'archiviazione è notificato, a cura del pubblico ministero, alla persona ' +
        'offesa che, nella notizia di reato o successivamente alla sua presentazione, ' +
        "abbia dichiarato di volere essere informata circa l'eventuale archiviazione. " +
        'Nell\'avviso è precisato che, nel termine di venti giorni, la persona offesa ' +
        'può prendere visione degli atti e presentare opposizione con richiesta ' +
        'motivata di prosecuzione delle indagini preliminari, ed è informata della ' +
        'facoltà di accedere ai programmi di giustizia riparativa; per i delitti ' +
        "commessi con violenza alla persona e per il reato di cui all'articolo " +
        '624-bis c.p. l\'avviso è in ogni caso notificato e il termine è elevato a ' +
        'trenta giorni.',
      fonte:
        'https://www.normattiva.it/atto/caricaDettaglioAtto?atto.dataPubblicazioneGazzetta=1988-10-24&atto.codiceRedazionale=088G0492&atto.articolo.numero=408&atto.articolo.sottoArticolo=1&atto.articolo.sottoArticolo1=10&atto.articolo.flagTipoArticolo=0',
    },
    usage:
      "nella parte finale: la dichiarazione di voler essere informati dell'eventuale " +
      'archiviazione va resa qui, perché è questo il momento previsto dalla norma. ' +
      'Subordinala alla qualità di persona offesa. Il termine di venti giorni (trenta ' +
      'nei casi del comma 3-bis) non è una richiesta dell\'atto: è un avvertimento e ' +
      'va nella sezione «Note», perché decorre dalla notifica e chi non lo conosce lo ' +
      'lascia scadere.',
  },
  {
    reference: {
      citazione: 'art. 335, commi 3 e 3-ter, c.p.p.',
      contenuto:
        'Ad esclusione dei casi in cui si procede per uno dei delitti di cui ' +
        "all'articolo 407, comma 2, lettera a), le iscrizioni nel registro delle " +
        'notizie di reato sono comunicate alla persona alla quale il reato è ' +
        'attribuito, alla persona offesa e ai rispettivi difensori, ove ne facciano ' +
        'richiesta. Senza pregiudizio del segreto investigativo, decorsi sei mesi ' +
        'dalla data di presentazione della denuncia, ovvero della querela, la persona ' +
        'offesa dal reato può chiedere di essere informata dall\'autorità che ha in ' +
        'carico il procedimento circa lo stato del medesimo.',
      fonte:
        'https://www.normattiva.it/atto/caricaDettaglioAtto?atto.dataPubblicazioneGazzetta=1988-10-24&atto.codiceRedazionale=088G0492&atto.articolo.numero=335&atto.articolo.sottoArticolo=1&atto.articolo.sottoArticolo1=10&atto.articolo.flagTipoArticolo=0',
    },
    usage:
      'nella parte finale, come richiesta di informazioni. Anche questo va ' +
      'subordinato alla qualità di persona offesa e non deve suonare come una ' +
      'pretesa: la legge fa salvo il segreto investigativo e il comma 3 esclude ' +
      'alcune categorie di delitti.',
  },
  {
    reference: {
      citazione: 'art. 90, comma 1, c.p.p.',
      contenuto:
        'La persona offesa dal reato, oltre ad esercitare i diritti e le facoltà ad ' +
        'essa espressamente riconosciuti dalla legge, in ogni stato e grado del ' +
        'procedimento può presentare memorie e, con esclusione del giudizio di ' +
        'cassazione, indicare elementi di prova.',
      fonte:
        'https://www.normattiva.it/atto/caricaDettaglioAtto?atto.dataPubblicazioneGazzetta=1988-10-24&atto.codiceRedazionale=088G0492&atto.articolo.numero=90&atto.articolo.sottoArticolo=1&atto.articolo.sottoArticolo1=10&atto.articolo.flagTipoArticolo=0',
    },
    usage:
      'nella parte finale, come riserva. Va sempre subordinato: «per chi fra i ' +
      'sottoscrittori rivesta la qualità di persona offesa». Non dare per acquisita ' +
      'quella qualità: dipende dal reato che il magistrato eventualmente ravviserà.',
  },
]

/** Firme necessarie prima di considerare l'esposto sostenuto. */
const SIGNATURES_TARGET = 100

/**
 * Testo mostrato a chi sta per firmare, riprodotto parola per parola.
 *
 * Non è rivolto alla Procura e non fa parte dell'atto trasmesso: è l'unico
 * punto in cui il cittadino legge che cosa comporta la sua firma. Senza questo
 * blocco, chi firma deduce dalle richieste finali di avere diritto a essere
 * informato dell'archiviazione — cosa che spetta soltanto a chi il magistrato
 * riconosca come persona offesa, e comunque solo a chi sottoscrive di persona.
 */
const SIGNING_NOTICE = `Questa sezione non fa parte dell'atto trasmesso alla Procura. Riguarda te, che stai per firmare.

- Firmare significa sostenere questo esposto. Non significa presentare una denuncia a tuo nome.
- Il tuo nome non viene trasmesso all'autorità giudiziaria. Se un giorno servisse, te lo chiederemmo a parte e potresti dire di no.
- Firmare non ti attribuisce la qualità di persona offesa. Quella la riconosce il magistrato, non chi scrive l'atto.
- Nessun esito è garantito. La Procura può archiviare senza aprire alcuna indagine.
- Puoi revocare la firma in qualsiasi momento, fino all'invio dell'atto.
- Questo testo è una bozza. Una persona lo legge e lo corregge prima di qualsiasi invio.`

const SYSTEM_PROMPT = `${REGOLE_COMUNI}

===========================================================================
ATTO DA REDIGERE: ESPOSTO ALLA PROCURA DELLA REPUBBLICA
===========================================================================

Ti stai rivolgendo all'autorità giudiziaria. Fra gli atti di questo servizio è
quello con la posta più alta: se è scritto male non viene soltanto cestinato,
espone chi lo firma. Scrivi con la prudenza di un avvocato, non con il tono di
un comunicato.

A. CHE COS'È QUESTO ATTO, E QUAL È IL SUO LIMITE

L'atto è una denuncia di fatti presentata da privati ai sensi dell'art. 333
c.p.p. Il suo unico scopo è portare a conoscenza del pubblico ministero fatti
circostanziati, verificabili e riferiti a un arco di tempo definito, e chiedere
che valuti se costituiscano reato.

B. IL DIVIETO PIÙ IMPORTANTE: NON QUALIFICARE IL REATO

La qualificazione giuridica del fatto non spetta a chi scrive. Non usare mai,
in nessun punto dell'atto, formule come:
  - «è stato commesso il reato di …», «si è consumato il delitto di …»
  - «la condotta integra …», «ricorrono gli estremi del reato di …»
  - «i responsabili sono …», «vi è dolo», «vi è colpa grave»
  - qualunque frase che dia per accertato un reato o ne indichi l'autore.

Attribuire ad altri un reato che non hanno commesso è a sua volta un reato: per
questo l'atto non indica colpevoli e non qualifica le condotte.

L'unica forma ammessa è dubitativa, una volta sola, nella parte finale:
«voglia valutare se nei fatti sopra esposti siano ravvisabili estremi di reato
e, in caso affermativo, procedere per quanto di competenza».

C. QUESTO ATTO NON È UNA QUERELA

Non scrivere «sporge querela», «chiede che si proceda penalmente nei confronti
di», «manifesta la volontà che si proceda». Chi ha firmato ha aderito a un
esposto: non ha espresso la volontà di punire nessuno, e attribuirgliela
sarebbe un falso. L'atto espone fatti e chiede una valutazione, nient'altro.

D. NESSUNA PERSONA FISICA, NEMMENO PER VIA INDIRETTA

Non nominare persone e non identificarle per ruolo individuale.

Togliere i nomi non basta. Una struttura individuabile, più una data puntuale,
più una fascia oraria individuano un insieme determinato di persone in servizio
quel giorno: è l'equivalente di fare un nome, e quelle persone non hanno alcuna
tutela perché nessun procedimento è aperto. Perciò, nel corpo dell'atto:
  - non accostare mai il riferimento a una struttura e una data puntuale;
  - non riportare orari, turni, notti, né formule come «la notte del …»;
  - le date puntuali stanno soltanto nell'elenco «Segnalazioni richiamate»; nel
    corpo si indica l'arco temporale complessivo, una volta sola.

Il luogo che leggi nelle segnalazioni è una stringa scritta dal cittadino, non
una denominazione ufficiale. Segnalazioni con lo stesso luogo generico NON
provano che si tratti della stessa struttura: in un comune possono essercene
diverse. Se il luogo non contiene una denominazione precisa, dillo, nella forma
imposta dal punto G.5.

Nel corpo dell'atto non compare alcun nome di cittadino: né di chi ha segnalato,
né di chi sottoscrive.

E. FATTI, RIMANDI, NUMERI

  - Ogni fatto esposto porta il rimando alla segnalazione da cui viene: [1],
    oppure [2][4][5] se più segnalazioni dicono la stessa cosa.
  - Le date puntuali NON entrano nel corpo. È il rimando [n] a legare il fatto
    alla sua data, che il lettore trova nell'elenco «Segnalazioni richiamate».
  - L'arco temporale complessivo si indica una sola volta, nel «CONSIDERATO
    CHE», nella forma esatta che trovi nel materiale.
  - Le quantificazioni sono soltanto conteggi delle segnalazioni richiamate:
    «tre delle cinque segnalazioni richiamate riferiscono attese pari o
    superiori a sei ore». Mai medie, mai percentuali, mai «numerosi cittadini».
  - Conta solo ciò che la segnalazione dice davvero. Un'attesa di sei ore non
    entra nel conteggio di quelle «superiori a sei ore»; un'attesa non
    quantificata non entra in nessun conteggio di durata.
  - L'unico numero di segnalazioni che puoi dichiarare è quello delle
    segnalazioni richiamate nel materiale. Non dichiarare quante ne contenga il
    gruppo e non dedurlo: quel totale non ti è stato dato perché non è un dato
    verificato, e a un'autorità giudiziaria non si dichiarano numeri che nessuno
    ha controllato.
  - Ciò che compare in una sola segnalazione resta al singolare: «una
    segnalazione riferisce che…».
  - Riporta fra virgolette al massimo una frase per segnalazione, e solo quando
    la formulazione originale aggiunge qualcosa. Il resto è discorso indiretto.

F. USO DEI RIFERIMENTI NORMATIVI

Puoi citare soltanto le norme elencate nel materiale, e soltanto alle
condizioni d'uso indicate accanto a ciascuna. Nel dubbio non citare: un esposto
con tre riferimenti esatti vale più di uno pieno di articoli fuori luogo.
Nessun altro articolo del codice penale entra nell'atto: richiamarne uno per
descrivere i fatti significa qualificare il reato, e violerebbe il punto B.
L'unica norma penale ammessa è l'art. 328, comma 2, c.p., e solo se ricorre la
condizione scritta accanto a essa e solo in forma dubitativa.

G. STRUTTURA OBBLIGATORIA, IN QUEST'ORDINE

1. Blocco destinatario, in alto, su righe separate. Riporta esattamente il
   blocco destinatario che trovi nel materiale, senza aggiungere indirizzi.
2. Riga «**Oggetto:**» seguita da «Esposto ai sensi dell'art. 333 c.p.p. —» e
   dall'oggetto in una riga sola. Costruiscilo con la materia, il comune e il
   numero delle segnalazioni richiamate. Non riprodurre il titolo del gruppo,
   non nominare il quartiere, non anticipare valutazioni.
3. Apertura, un capoverso: «Il/La sottoscritto/a [DA COMPLETARE: nome, cognome,
   luogo e data di nascita, residenza, codice fiscale, recapito]», seguito dal
   segnaposto «[DA COMPLETARE: procura speciale ex art. 333, comma 2, c.p.p., se
   l'atto è presentato per conto di altri]» e dall'indicazione che l'atto espone
   fatti riferiti da un numero indicato di segnalazioni ricevute dal servizio,
   tutte richiamate in calce. Il soggetto che promuove la raccolta resta un
   segnaposto.
   Tieni distinti due insiemi, e non confonderli mai:
     - i segnalanti, cioè i cittadini che hanno riferito i fatti: compaiono solo
       come numero e come rimandi [n];
     - i sottoscrittori, cioè chi firma l'atto per sostenerlo: non riferiscono
       fatti propri e non sono testimoni di nulla.
   L'atto non attribuisce ai sottoscrittori alcuna segnalazione, non li presenta
   come autori dei fatti esposti e non rende dichiarazioni in loro nome.
4. Sezione «## PREMESSO CHE»: i fatti, raggruppati per elemento ricorrente e non
   uno per segnalazione, un capoverso per elemento, nella forma «tre
   segnalazioni riferiscono … [1][3][4];» oppure «una segnalazione riferisce …
   [2];». Il titolo della sezione contiene già il «che»: non ripeterlo a inizio
   capoverso. Nessuna data puntuale qui. Ogni capoverso si chiude con il punto e
   virgola, l'ultimo con il punto.
5. Sezione «## CONSIDERATO CHE»: stessa forma, stessa punteggiatura. Contiene
   l'arco temporale complessivo (una sola volta, nella forma indicata nel
   materiale), che cosa i fatti hanno in comune, quante segnalazioni riferiscono
   ciascun elemento ricorrente, e i riferimenti normativi ammessi.
   Sul luogo usa la formula obbligata, adattandola alle parole del materiale:
   «i fatti sono collocati in un [tipo di struttura], indicato nelle
   segnalazioni come "[luogo dichiarato dal cittadino]"; le segnalazioni non
   permettono di stabilire se si tratti sempre della stessa struttura, né di
   individuare l'ente cui essa fa capo». Quando il luogo dichiarato non contiene
   una denominazione, non usare mai l'articolo determinativo singolare («il
   pronto soccorso»): scrivi «un pronto soccorso». Nessuna attribuzione di
   responsabilità, qui come altrove.
6. Sezione «## TUTTO CIÒ PREMESSO, CHIEDE»: un elenco puntato, in quest'ordine:
     a) la formula dubitativa del punto B;
     b) la dichiarazione o elezione di domicilio per le notificazioni, con il
        segnaposto «[DA COMPLETARE: domicilio o indirizzo di posta elettronica
        certificata per le notificazioni]»;
     c) la dichiarazione di voler essere informati dell'eventuale archiviazione;
     d) la richiesta di essere informati sullo stato del procedimento;
     e) la riserva di presentare memorie e indicare elementi di prova.
   Chiudi l'elenco con questa riga, che limita le dichiarazioni a chi le rende
   davvero: «Le dichiarazioni e le richieste di cui alle lettere b), c), d) ed
   e) sono rese esclusivamente da chi sottoscrive personalmente il presente
   atto, e restano subordinate al riconoscimento in capo al medesimo della
   qualità di persona offesa.»
7. Riga con luogo e data: «[DA COMPLETARE: luogo], [DA COMPLETARE: data]».
8. Riga con la firma: «Firma [DA COMPLETARE: sottoscrizione autografa di chi
   presenta l'atto]», seguita dalla riga «Il presente esposto è sottoscritto dal
   denunciante ai sensi dell'art. 333, comma 2, c.p.p.». Non scrivere che l'atto
   è sottoscritto da più persone identificate: la piattaforma non verifica
   l'identità di chi aderisce online, e affermarlo sarebbe falso.
9. Sezione «## Allegati»: contiene soltanto segnaposto, perché nessun allegato
   viene prodotto automaticamente e annunciare allegati inesistenti fa apparire
   l'atto costruito a tavolino:
     - «[DA COMPLETARE: allegato A — testo integrale, in forma anonimizzata,
       delle segnalazioni richiamate, da comporre e allegare a mano]»;
     - i segnaposto degli allegati che solo una persona può procurare
       (documenti, riscontri, corrispondenza).
   Non dichiarare alcun allegato con l'elenco nominativo dei sottoscrittori o
   dei segnalanti: quei dati non vengono trasmessi. Aggiungi, come istruzione
   per chi comporrà l'allegato A, che la sua numerazione deve essere
   indipendente da quella dei rimandi [n] e non seguirne l'ordine, perché il
   collegamento fra una persona e la sua segnalazione non sia ricostruibile.
10. Sezione «## Segnalazioni richiamate»: elenco numerato, nell'ordine dei
    rimandi, con numero, data e luogo dichiarato di ciascuna segnalazione
    citata. Premetti all'elenco una riga sola: «I luoghi sono riportati come
    dichiarati dai cittadini nelle segnalazioni.» Nessun testo integrale qui.
11. Sezione «## Note»: è rivolta a chi rivede l'atto prima dell'invio. Contiene
    sempre, anche quando non ci sono altre lacune:
      - l'avvertimento sui termini: se il pubblico ministero chiede
        l'archiviazione, l'avviso concede venti giorni per prendere visione
        degli atti e presentare opposizione con richiesta motivata di
        prosecuzione delle indagini — trenta giorni nei casi del comma 3-bis —
        e il termine decorre dalla notifica, non dal momento in cui l'avviso
        viene letto; alla ricezione occorre rivolgersi subito a un difensore,
        senza attendere;
      - l'indicazione che l'atto dichiara soltanto il numero delle segnalazioni
        richiamate, perché il totale del gruppo non è un dato verificato;
      - il quartiere registrato dalla piattaforma, se te lo hanno dato, come
        dato da verificare a mano per la competenza territoriale e non come
        circostanza riferita dai cittadini;
      - le altre lacune reali: destinatario non individuato, dati del
        sottoscrittore, allegati da comporre, circostanze che le segnalazioni
        non chiariscono, consenso alla trasmissione da verificare.
12. Sezione «## Cosa comporta firmare»: riporta il testo che segue parola per
    parola, senza riscriverlo e senza aggiungere altro.
    ${SIGNING_NOTICE}
13. Sezione «## Avvertenza»: riporta il testo che segue parola per parola, senza
    riscriverlo e senza aggiungere altro.
    ${DISCLAIMER_AI}

H. PERSONE CHE NON HANNO SCRITTO: TERZI, MINORI, DATI SANITARI

Chi scrive a VOCE acconsente per sé. Le persone descritte in una segnalazione —
un familiare, un figlio, un vicino — non hanno acconsentito a nulla e spesso non
sanno di comparire in un atto. Il corpo dell'esposto è pubblico.

Perciò, quando una segnalazione riguarda una persona minorenne o la condizione
di salute di un terzo:
  - indica la circostanza in forma generica: «una persona con sintomi che
    richiedevano valutazione urgente», «una persona minorenne». Mai la diagnosi,
    mai il sintomo puntuale, mai il rapporto di parentela con chi ha segnalato;
  - non accostare mai, nello stesso capoverso, una condizione di salute, una
    data puntuale e un luogo: insieme ricostruiscono l'episodio e la persona;
  - il dettaglio clinico non entra nel corpo. Resta nell'allegato A, che è
    destinato alla sola Procura e non viene pubblicato.
Nel dubbio, scegli la forma generica: un fatto descritto in modo più ampio resta
utilizzabile, una persona identificata non si può più proteggere.

I. COSA NON FARE, MAI

  - Non aggiungere fatti, cifre, orari, diagnosi o conseguenze che le
    segnalazioni non contengono.
  - Non ricostruire un nesso di causa fra un disservizio e un danno: descrivi il
    disservizio e, se c'è, il danno, separatamente.
  - Non riprodurre come fatto il titolo o il riassunto del gruppo, e non
    nominare il quartiere fuori dalla sezione «Note».
  - Non contraddirti: se scrivi che le segnalazioni non permettono di
    individuare la struttura, non trattarle altrove come riferite alla stessa.
  - Non nominare partiti, comitati, testate, né descrivere iniziative politiche.
  - Non usare superlativi, avverbi di indignazione, punti esclamativi, domande
    retoriche, corsivi enfatici, emoji.
  - Non scrivere frasi che si commentano da sole («è inaccettabile che…»,
    «è evidente che…»): al loro posto sta un fatto con un rimando.
  - Non superare le 900 parole prima della sezione «Segnalazioni richiamate».
    Un esposto lungo si legge male; i fatti stanno negli allegati.`

/** Nomi dei mesi come li produce `toLocaleDateString('it-IT', …)`. */
const ITALIAN_MONTHS: Record<string, number | undefined> = {
  gennaio: 0,
  febbraio: 1,
  marzo: 2,
  aprile: 3,
  maggio: 4,
  giugno: 5,
  luglio: 6,
  agosto: 7,
  settembre: 8,
  ottobre: 9,
  novembre: 10,
  dicembre: 11,
}

/** Etichette leggibili delle categorie, per comporre un titolo neutro. */
const CATEGORY_LABELS: Record<string, string | undefined> = {
  sanita: 'sanità',
  mobilita: 'mobilità',
  ambiente: 'ambiente',
  sicurezza: 'sicurezza urbana',
  scuola: 'scuola',
  servizi_sociali: 'servizi sociali',
  urbanistica: 'urbanistica',
  trasparenza: 'trasparenza amministrativa',
  altro: 'segnalazioni dei cittadini',
}

function categoryLabel(categoria: string): string {
  return CATEGORY_LABELS[categoria] ?? categoria.replace(/_/g, ' ')
}

/** «18 luglio 2026» → timestamp ordinabile. `null` se il formato non è quello. */
function parseItalianDate(value: string): number | null {
  const match = /^(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})$/.exec(value.trim())
  if (!match) return null

  const month = ITALIAN_MONTHS[match[2].toLowerCase()]
  if (month === undefined) return null

  return Date.UTC(Number(match[3]), month, Number(match[1]))
}

/**
 * L'arco temporale coperto dalle segnalazioni richiamate.
 *
 * È l'unico dato temporale che l'atto può esporre nel corpo: le date puntuali
 * restano nell'elenco in calce, perché accostate a una struttura individuabile
 * indicano chi era in servizio quel giorno.
 *
 * Se le date non sono nel formato atteso si usa il primo e l'ultimo elemento:
 * `dossier.ts` costruisce le citazioni ordinate per data crescente.
 */
function formatDateRange(citations: readonly SegnalazioneCitabile[]): string | null {
  if (citations.length === 0) return null

  let first = citations[0].data
  let last = citations[citations.length - 1].data

  const parsed: { label: string; value: number }[] = []
  for (const citation of citations) {
    const value = parseItalianDate(citation.data)
    if (value !== null) parsed.push({ label: citation.data, value })
  }

  if (parsed.length > 0) {
    let min = parsed[0]
    let max = parsed[0]
    for (const entry of parsed) {
      if (entry.value < min.value) min = entry
      if (entry.value > max.value) max = entry
    }
    first = min.label
    last = max.label
  }

  return first === last ? `del ${first}` : `dal ${first} al ${last}`
}

/**
 * Il blocco destinatario, così come deve comparire in testa all'atto.
 *
 * Il destinatario si prende da `pa_endpoints`. Se manca, l'atto resta bozza con
 * un segnaposto esplicito: spedire un esposto alla Procura sbagliata è peggio
 * che non spedirlo.
 */
function formatRecipient(ctx: ContestoAtto): string {
  const declared = ctx.destinatario?.trim()
  if (declared) return declared
  return (
    '[DA COMPLETARE: Procura della Repubblica presso il Tribunale ' +
    `territorialmente competente per ${ctx.cluster.citta} — denominazione esatta, ` +
    'indirizzo e recapito da verificare]'
  )
}

/**
 * Una citazione, con il luogo marcato per quello che è.
 *
 * `luogo` è `location_hint`: una stringa scritta dal cittadino, non una
 * denominazione verificata. Passarla come dato di fatto ha prodotto atti che
 * trattavano quattro stringhe uguali come prova che si trattasse della stessa
 * struttura, e poi ammettevano di non poterla individuare.
 */
function formatCitation(citation: SegnalazioneCitabile): string {
  const place = citation.luogo?.trim()
  const declaredPlace = place
    ? `luogo dichiarato dal cittadino: "${place}"`
    : 'nessun luogo dichiarato'
  return `[${citation.indice}] ${citation.data} — ${declaredPlace} — segnalazione: "${citation.testo}"`
}

/**
 * I riferimenti citabili per questo caso, con le loro condizioni d'uso.
 *
 * Al modello vanno tutti, condizionati compresi: la condizione è scritta
 * accanto e il modello deve poterla valutare. In appendice al documento va
 * invece solo il sottoinsieme incondizionato (vedi `riferimenti` in fondo).
 */
function formatReferences(): string {
  return REFERENCE_CATALOG.map(
    (entry) =>
      `- ${entry.reference.citazione} — ${entry.reference.contenuto}\n` +
      `  Uso ammesso: ${entry.usage}`,
  ).join('\n')
}

/**
 * Titolo dell'atto, costruito con i soli dati certi.
 *
 * Non usa `cluster.titolo`: è un'etichetta prodotta dalla piattaforma, che può
 * sovrastimare ciò che le segnalazioni dicono davvero («attese oltre sei ore»
 * su cinque segnalazioni di cui due sotto le sei ore). Questo titolo finisce
 * nel `<title>` di una pagina pubblica e nell'oggetto di un atto diretto a una
 * Procura: deve reggere da solo.
 */
function buildTitle(ctx: ContestoAtto): string {
  const soggetto = `${categoryLabel(ctx.cluster.categoria)} — ${ctx.cluster.citta}`
  const arco = formatDateRange(ctx.citazioni)
  return arco
    ? `Esposto alla Procura della Repubblica — ${soggetto} (segnalazioni ${arco})`
    : `Esposto alla Procura della Repubblica — ${soggetto}`
}

function buildUserPrompt(ctx: ContestoAtto): string {
  const { cluster, citazioni } = ctx
  const recipientNote = ctx.destinatario?.trim()
    ? 'Il destinatario è noto: riporta il blocco qui sopra tale e quale, senza integrarlo.'
    : 'Il destinatario NON è ancora individuato: riporta il segnaposto qui sopra tale e ' +
      'quale, senza sostituirlo con un ufficio plausibile, e ripeti la lacuna nella ' +
      'sezione «Note» precisando che l\'atto non può essere inviato finché una persona ' +
      'non ha individuato la Procura competente.'

  const citationsBlock = citazioni.length
    ? citazioni.map(formatCitation).join('\n')
    : 'Nessuna segnalazione citabile è stata fornita.'

  const citationsNote = citazioni.length
    ? `Sono ${citazioni.length} segnalazioni, e sono le uniche su cui puoi scrivere. ` +
      `Nel testo dichiara soltanto questo numero: «${citazioni.length} segnalazioni ` +
      'richiamate». Non dichiarare quante segnalazioni contenga il gruppo e non ' +
      'tentare di dedurlo — quel totale non ti è stato fornito perché non è ' +
      'verificato.'
    : 'Senza segnalazioni citabili non è possibile esporre alcun fatto: scrivi solo ' +
      'l\'intestazione, l\'oggetto e la sezione «Note», dichiarando che l\'atto non è ' +
      'redigibile.'

  const arco = formatDateRange(citazioni) ?? 'non determinabile'

  return `MATERIALE PER L'ESPOSTO. Non uscire da qui: tutto ciò che non è scritto sotto non esiste.

DATI DI PIATTAFORMA — NON SONO FATTI, NON ENTRANO NEL CORPO DELL'ATTO
Titolo del gruppo: ${cluster.titolo}
Riassunto del gruppo: ${cluster.riassunto}
Quartiere registrato: ${cluster.quartiere ?? 'non registrato'}

Titolo e riassunto sono etichette generate automaticamente per orientare la
lettura: non sono fonti e non vanno riprodotti come affermazioni di fatto, né
nell'oggetto né altrove. Possono sovrastimare ciò che le segnalazioni dicono:
verifica sempre sulle segnalazioni numerate.
Il quartiere è un metadato della piattaforma: nessuna segnalazione dichiara dove
risiedono i cittadini, e restringere la platea a un quartiere espone chi ha
firmato. Può comparire soltanto nella sezione «Note», come dato da verificare
per la competenza territoriale.

DATI CERTI DEL GRUPPO
Materia: ${cluster.categoria}
Comune: ${cluster.citta}
Segnalazioni richiamabili: ${citazioni.length}
Arco temporale delle segnalazioni richiamate: ${arco}

BLOCCO DESTINATARIO (copialo in testa all'atto, riga per riga)
${formatRecipient(ctx)}

${recipientNote}

SEGNALAZIONI RICHIAMABILI
${citationsBlock}

${citationsNote}

RIFERIMENTI NORMATIVI UTILIZZABILI (nessun altro, a nessun titolo)
${formatReferences()}

Scrivi ora l'esposto in Markdown, seguendo la struttura obbligatoria.`
}

export const espostoProcura: ModelloAtto = {
  kind: 'esposto_procura',
  ruoloDestinatario: 'procura',
  firmeObiettivo: SIGNATURES_TARGET,
  titolo: buildTitle,
  systemPrompt: SYSTEM_PROMPT,
  userPrompt: buildUserPrompt,
  // Solo i riferimenti incondizionati.
  //
  // `componiAtto` stampa questo elenco in fondo a `body_markdown`, sotto
  // «Riferimenti normativi», senza conoscere le condizioni d'uso. Esportare il
  // catalogo intero significava chiudere l'atto con una norma penale che il
  // corpo dichiarava di non richiamare: per il lettore, quello è l'addebito
  // che il testo diceva di non muovere.
  riferimenti: REFERENCE_CATALOG.filter((entry) => !entry.conditional).map(
    (entry) => entry.reference,
  ),

  /**
   * Nessun termine, ed è una scelta, non una lacuna.
   *
   * Chi riceve una denuncia non ha un termine di legge per rispondere a chi
   * l'ha presentata: il pubblico ministero iscrive la notizia di reato e
   * conduce le indagini con i tempi del codice di procedura penale, che
   * riguardano il procedimento e non il denunciante. Contare trenta giorni e
   * poi «sollecitare» una Procura non è un rimedio previsto: è rumore, e
   * rumore mandato all'ufficio meno adatto a riceverlo.
   *
   * Coerente con `action_follow_up_kind()`, che per `esposto_procura`
   * restituisce null e quindi non prepara nessun atto di seguito.
   */
  termine: null,
}
