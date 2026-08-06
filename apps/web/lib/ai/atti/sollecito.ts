/**
 * Sollecito di conclusione del procedimento e richiesta di esercizio del potere
 * sostitutivo — art. 2, commi 9-bis e 9-ter, L. 7 agosto 1990, n. 241.
 *
 * È l'atto che nasce dallo scadenzario (PLAN2 §3.1), non dalla generazione
 * iniziale del dossier: si prepara quando un atto già inviato ha superato il
 * termine di legge senza che risulti un riscontro.
 *
 * PERCHÉ NON È «UNA SECONDA LETTERA».
 * Un cittadino che riscrive allo stesso ufficio che non ha risposto ottiene, di
 * norma, lo stesso silenzio. L'art. 2 della L. 241/1990 prevede un meccanismo
 * diverso: ogni amministrazione deve individuare — e pubblicare sul proprio
 * sito, in tabella e con collegamento visibile in homepage — un soggetto
 * titolare del potere sostitutivo in caso di inerzia (comma 9-bis). Decorso
 * inutilmente il termine, quel soggetto, anche su richiesta dell'interessato,
 * esercita il potere sostitutivo e conclude il procedimento entro un termine
 * pari alla metà di quello originariamente previsto (comma 9-ter). Questo atto
 * si rivolge a lui. È la differenza fra insistere e attivare un rimedio.
 *
 * IL RISCHIO SPECIFICO DI QUESTO ATTO, che ne determina l'intera forma.
 * La piattaforma sa una cosa sola: che nel proprio archivio non risulta
 * registrata alcuna risposta. Non sa se l'amministrazione abbia comunicato con
 * il richiedente per altra via, se il termine sia stato sospeso per acquisire
 * informazioni (art. 2, comma 7) o per la comunicazione ai controinteressati,
 * né se il procedimento abbia un termine diverso da quello ordinario. Scrivere
 * «l'amministrazione non ha risposto» come fatto accertato, o peggio «ha
 * violato l'art. 2», significa muovere un addebito che chi firma non è in grado
 * di dimostrare — e regalare all'ufficio la risposta più comoda: «le abbiamo
 * scritto il giorno tale». Da qui le formule di cautela obbligatorie e il
 * divieto assoluto di qualificare condotte.
 *
 * Tutti i riferimenti in fondo al file sono stati verificati sul testo vigente
 * dell'art. 2 della L. 241/1990 pubblicato da Normattiva: l'URL è nel campo
 * `fonte`.
 */

import {
  REGOLE_COMUNI,
  type AttoPrecedente,
  type ContestoAtto,
  type ModelloAtto,
  type RiferimentoNormativo,
  type SegnalazioneCitabile,
} from './tipi'
// I marcatori della sezione di servizio sono definiti una volta sola: la pagina
// pubblica e il PDF li tolgono cercando queste stringhe esatte, e una seconda
// coppia di marcatori diversa lascerebbe le note di revisione visibili a chi
// riceve l'atto.
import { NOTE_REVISIONE_FINE, NOTE_REVISIONE_INIZIO } from './accesso-civico'

/**
 * L'art. 2 della L. 241/1990, nei commi che servono e per intero.
 *
 * I commi sono riportati senza tagli anche dove sarebbe più breve troncarli: la
 * REGOLA COMUNE n. 4 vieta al modello di citare ciò che non gli è stato dato,
 * quindi un comma tagliato a metà diventa un'informazione che l'atto non potrà
 * mai dare — ed è proprio il caso del comma 7, la sospensione che rende
 * prudente ogni affermazione sul decorso del termine.
 *
 * NON compare l'art. 31 del Codice del processo amministrativo, che pure
 * disciplina l'azione avverso il silenzio e il suo termine annuale. Il motivo è
 * la disciplina che questo progetto si è dato: il testo dell'articolo non è
 * stato ottenuto da una fonte ufficiale consultabile (Normattiva e Gazzetta
 * Ufficiale non restituiscono il corpo dell'articolo alle richieste
 * automatiche), e una norma non verificata non entra in un atto. Il rinvio al
 * codice del processo amministrativo resta comunque disponibile attraverso il
 * comma 8, che è verificato e che quel rinvio lo contiene testualmente.
 */
const FONTE_ART_2 =
  'https://www.normattiva.it/atto/caricaDettaglioAtto?atto.dataPubblicazioneGazzetta=1990-08-18&atto.codiceRedazionale=090G0294&atto.articolo.numero=2&atto.articolo.sottoArticolo=1&atto.articolo.sottoArticolo1=10&atto.articolo.flagTipoArticolo=0'

const RIFERIMENTI: RiferimentoNormativo[] = [
  {
    citazione: 'art. 2, comma 1, L. 241/1990',
    contenuto:
      'Ove il procedimento consegua obbligatoriamente ad un\'istanza, ovvero debba essere iniziato d\'ufficio, le pubbliche amministrazioni hanno il dovere di concluderlo mediante l\'adozione di un provvedimento espresso.',
    fonte: FONTE_ART_2,
  },
  {
    citazione: 'art. 2, comma 2, L. 241/1990',
    contenuto:
      'Nei casi in cui disposizioni di legge ovvero i provvedimenti di cui ai commi 3, 4 e 5 non prevedono un termine diverso, i procedimenti amministrativi di competenza delle amministrazioni statali e degli enti pubblici nazionali devono concludersi entro il termine di trenta giorni.',
    fonte: FONTE_ART_2,
  },
  {
    citazione: 'art. 2, comma 6, L. 241/1990',
    contenuto:
      'I termini per la conclusione del procedimento decorrono dall\'inizio del procedimento d\'ufficio o dal ricevimento della domanda, se il procedimento è ad iniziativa di parte.',
    fonte: FONTE_ART_2,
  },
  {
    citazione: 'art. 2, comma 7, L. 241/1990',
    contenuto:
      'I termini possono essere sospesi, per una sola volta e per un periodo non superiore a trenta giorni, per l\'acquisizione di informazioni o di certificazioni relative a fatti, stati o qualità non attestati in documenti già in possesso dell\'amministrazione stessa o non direttamente acquisibili presso altre pubbliche amministrazioni.',
    fonte: FONTE_ART_2,
  },
  {
    citazione: 'art. 2, comma 8, L. 241/1990',
    contenuto:
      'La tutela in materia di silenzio dell\'amministrazione è disciplinata dal codice del processo amministrativo, di cui al decreto legislativo 2 luglio 2010, n. 104.',
    fonte: FONTE_ART_2,
  },
  {
    citazione: 'art. 2, comma 9, L. 241/1990',
    contenuto:
      'La mancata o tardiva emanazione del provvedimento costituisce elemento di valutazione della performance individuale, nonché di responsabilità disciplinare e amministrativo-contabile del dirigente e del funzionario inadempiente.',
    fonte: FONTE_ART_2,
  },
  {
    citazione: 'art. 2, comma 9-bis, L. 241/1990',
    contenuto:
      'L\'organo di governo individua un soggetto nell\'ambito delle figure apicali dell\'amministrazione o una unità organizzativa cui attribuire il potere sostitutivo in caso di inerzia. Nell\'ipotesi di omessa individuazione il potere sostitutivo si considera attribuito al dirigente generale o, in mancanza, al dirigente preposto all\'ufficio o in mancanza al funzionario di più elevato livello presente nell\'amministrazione. Per ciascun procedimento, sul sito internet istituzionale dell\'amministrazione è pubblicata, in formato tabellare e con collegamento ben visibile nella homepage, l\'indicazione del soggetto o dell\'unità organizzativa a cui è attribuito il potere sostitutivo e a cui l\'interessato può rivolgersi ai sensi e per gli effetti del comma 9-ter.',
    fonte: FONTE_ART_2,
  },
  {
    citazione: 'art. 2, comma 9-ter, L. 241/1990',
    contenuto:
      'Decorso inutilmente il termine per la conclusione del procedimento o quello superiore di cui al comma 7, il responsabile o l\'unità organizzativa di cui al comma 9-bis, d\'ufficio o su richiesta dell\'interessato, esercita il potere sostitutivo e, entro un termine pari alla metà di quello originariamente previsto, conclude il procedimento attraverso le strutture competenti o con la nomina di un commissario.',
    fonte: FONTE_ART_2,
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

/**
 * Il blocco che descrive l'atto rimasto senza riscontro.
 *
 * Senza questo blocco il modello non ha date, e senza date scriverebbe «è
 * trascorso molto tempo»: la forza di un sollecito sta esattamente nei due
 * numeri che qui vengono forniti già calcolati.
 */
function bloccoAttoPrecedente(precedente: AttoPrecedente): string {
  const righe = [
    `Tipo di atto: ${precedente.etichetta}`,
    `Titolo con cui è stato registrato: ${precedente.titolo}`,
    `Destinatario a cui è stato indirizzato: ${
      precedente.destinatario ?? 'non registrato — usa un segnaposto'
    }`,
    `Data di invio: ${precedente.inviatoIl}`,
    `Termine di legge: ${precedente.giorniTermine} giorni — ${precedente.baseTermine}`,
    `Data di scadenza del termine: ${precedente.scadutoIl}`,
    `Giorni trascorsi dalla scadenza: ${precedente.giorniDallaScadenza}`,
  ]

  if (precedente.corpo) {
    righe.push(
      '',
      'TESTO DELL\'ATTO RIMASTO SENZA RISCONTRO (per ricavarne l\'oggetto, non da ricopiare)',
      precedente.corpo,
    )
  }

  return righe.join('\n')
}

const ISTRUZIONI_SPECIFICHE = `---

ATTO DA REDIGERE: SOLLECITO DI CONCLUSIONE DEL PROCEDIMENTO E RICHIESTA DI
ESERCIZIO DEL POTERE SOSTITUTIVO
(art. 2, commi 9-bis e 9-ter, L. 7 agosto 1990, n. 241)

CHE COSA STAI SCRIVENDO
Un atto breve, procedurale e cortese, che fa due cose e nient'altro: ricorda che
un procedimento avviato non risulta concluso, e chiede a chi ha il potere
sostitutivo di concluderlo. Non è una diffida, non è un esposto, non è una
denuncia. Non accerta responsabilità, non chiede sanzioni, non qualifica come
illecita nessuna condotta.

LA REGOLA CHE VIENE PRIMA DI TUTTE: NON SAI SE NON HANNO RISPOSTO.
Sai soltanto che a chi ha sottoscritto l'atto non risulta pervenuto un
riscontro. Non sai se l'amministrazione abbia scritto per altra via, se il
termine sia stato sospeso ai sensi dell'art. 2, comma 7, o per la comunicazione
ad altri soggetti, né se quel procedimento abbia un termine diverso da quello
indicato.
Quindi, senza eccezioni:
  - scrivi «alla data odierna non risulta pervenuto al sottoscritto alcun
    riscontro», mai «l'amministrazione non ha risposto» e mai «è rimasta
    inerte»;
  - accompagna sempre l'affermazione sul decorso del termine con la clausola
    «ove il termine non risulti sospeso o interrotto ai sensi di legge»;
  - aggiungi una frase in questa sostanza: «Ove un riscontro sia già stato
    adottato o trasmesso, si chiede cortesemente di volerne dare comunicazione
    al recapito indicato, e la presente si intende superata.» Non è una
    concessione: è la frase che rende l'atto inattaccabile;
  - non scrivere che una norma è stata violata, che c'è stato un ritardo
    imputabile a qualcuno, che sussiste inadempimento o responsabilità;
  - non nominare persone fisiche, in nessun caso e a nessun titolo.

IL DESTINATARIO NON È CHI NON HA RISPOSTO
Questo atto si rivolge al soggetto o all'unità organizzativa titolare del potere
sostitutivo, individuato ai sensi dell'art. 2, comma 9-bis. È una figura diversa
dall'ufficio che ha ricevuto l'atto originario, e ogni amministrazione deve
pubblicarla sul proprio sito in formato tabellare, con collegamento visibile in
homepage.
  - Se il destinatario ti è stato fornito, riportalo alla lettera.
  - Se non ti è stato fornito, scrivi il segnaposto che ti viene indicato e non
    dedurre un ufficio plausibile. Fra le note per la revisione scrivi dove si
    trova il dato: la tabella dei titolari del potere sostitutivo pubblicata sul
    sito istituzionale dell'amministrazione.
  - In ogni caso l'atto va trasmesso per conoscenza anche all'ufficio a cui era
    stato indirizzato l'atto originario: indicalo come «e, per conoscenza,» con
    il destinatario originario o con un segnaposto.

CHI SOTTOSCRIVE
Il sollecito lo presenta la stessa persona che ha sottoscritto l'atto rimasto
senza riscontro: è lei la parte del procedimento, e solo lei può chiedere
l'esercizio del potere sostitutivo su quel procedimento.
  - Vietate le formule «anche a nome di», «per conto dei cittadini firmatari»,
    «in rappresentanza di».
  - Non allegare, non annunciare e non menzionare elenchi di sottoscrittori o di
    segnalanti.
  - Non indicare un numero di firme raccolte.
  - Scrivi fra le premesse: «I dati identificativi dei cittadini che hanno
    inviato le segnalazioni non sono trasmessi con il presente atto.»

L'OGGETTO DEL PROCEDIMENTO
Ti viene fornito il testo dell'atto rimasto senza riscontro. Serve a una cosa
sola: ricavarne, in due o tre righe, che cosa era stato chiesto.
  - Riassumilo in forma fedele e sintetica. Non aggiungere richieste nuove, non
    ampliarne l'oggetto, non riformularlo in termini più forti.
  - Non ricopiarlo e non riprodurne l'elenco per intero: il sollecito rinvia
    alla copia allegata, che è l'unico testo che fa fede.
  - Se il testo non ti è stato fornito, descrivi il procedimento con il solo
    titolo e la data, e lascia un segnaposto per l'oggetto.

I FATTI DEL GRUPPO: POCHI, E SOLO SE SERVONO
Questo atto verte sul procedimento, non sui fatti che lo hanno originato. Puoi
richiamare le segnalazioni al massimo in un capoverso, in forma aggregata e con
i riferimenti [n], soltanto per dire che la questione è tuttora attuale. Non
descrivere episodi individuali, non accostare mai una data singola a un
dettaglio riferito a una persona (condizione di salute, età, ruolo familiare,
professione), non riportare vie, numeri civici o denominazioni tratte dalle
segnalazioni. L'unico riferimento geografico è il comune, e l'eventuale
quartiere, del gruppo.

STRUTTURA (esattamente queste sezioni, in quest'ordine)
1. Titolo di primo livello: «Sollecito di conclusione del procedimento e
   richiesta di esercizio del potere sostitutivo», e sotto, su una riga, la base
   normativa.
2. Blocco di intestazione con «Destinatario:», «e, per conoscenza:» e
   «Oggetto:». L'oggetto sta in una riga e contiene il tipo di atto sollecitato,
   la sua data di invio e il comune.
3. Formula di apertura: «Il/La sottoscritto/a [DA COMPLETARE: nome, cognome,
   luogo e data di nascita, residenza, codice fiscale, recapito]», che dichiara
   di aver presentato in proprio l'atto indicato.
4. «Premesso che»: un capoverso per ciascuno di questi punti, nell'ordine —
   la presentazione dell'atto originario con la sua data; l'oggetto di quella
   richiesta in forma sintetica; il termine di legge applicabile con la sua base
   normativa, così come ti è stato fornito; la circostanza che alla data odierna
   non risulta pervenuto alcun riscontro, con la clausola sulla sospensione;
   l'eventuale capoverso sui fatti del gruppo con i riferimenti [n].
5. «Considerato che»: il dovere di concludere con provvedimento espresso e il
   meccanismo del potere sostitutivo, citando i commi che ti sono stati forniti.
   Tono espositivo: si richiama la norma, non si accusa.
6. «Tutto ciò premesso, chiede»: elenco numerato di non più di quattro punti —
   la conclusione del procedimento con provvedimento espresso e motivato; in
   subordine, l'esercizio del potere sostitutivo ai sensi dell'art. 2, comma
   9-ter, entro un termine pari alla metà di quello originariamente previsto; la
   comunicazione dell'esito al recapito indicato; se pertinente, l'indicazione
   del responsabile del procedimento.
7. «Precisazioni»: la frase sull'eventuale riscontro già adottato, la
   disponibilità a fornire chiarimenti, la modalità e il recapito per la
   risposta (con segnaposto), la non trasmissione dei dati dei segnalanti.
8. Blocco di chiusura: «Luogo e data», «Firma», «Allegati». Fra gli allegati
   indica la copia dell'atto rimasto senza riscontro e la prova del suo invio,
   entrambe come segnaposto: «[DA COMPLETARE: copia dell'atto trasmesso in data
   … e ricevuta di trasmissione]».
9. Note per la revisione, racchiuse fra i due marcatori
   ${NOTE_REVISIONE_INIZIO} e ${NOTE_REVISIONE_FINE}, ciascuno su una riga
   propria. Sono l'ultima cosa che scrivi, non sono parte dell'atto e sono
   leggibili anche da chi lo riceverà: contengono soltanto l'elenco dei
   segnaposto rimasti e dei controlli da fare. Non scriverci valutazioni sulla
   solidità dell'atto, ipotesi su come l'amministrazione potrebbe replicare o
   proposte di togliere parti del testo. I controlli sempre presenti sono:
   l'individuazione del titolare del potere sostitutivo sul sito
   dell'amministrazione, la verifica che nel frattempo non sia arrivato un
   riscontro, la verifica che il termine indicato sia quello effettivamente
   applicabile a quel procedimento, l'allegazione della copia dell'atto
   originario e i dati del richiedente.

REGISTRO
Italiano amministrativo, impersonale, asciutto. I verbi sono «risulta», «non
risulta pervenuto», «si chiede», «si rammenta». Nessun aggettivo di giudizio,
nessun punto esclamativo, nessuna minaccia di azioni legali, nessun termine
perentorio inventato («entro e non oltre sette giorni»). Lunghezza complessiva
fra 350 e 600 parole: un sollecito lungo è un sollecito che non viene letto.

COSA NON FARE, MAI
- Non affermare che l'amministrazione ha violato una norma, è inadempiente o è
  in ritardo.
- Non nominare persone fisiche, né come destinatari né come responsabili.
- Non minacciare denunce, esposti, ricorsi o richieste di risarcimento.
- Non fissare termini che nessuna norma prevede.
- Non ampliare l'oggetto della richiesta originaria e non aggiungerne di nuovi.
- Non citare norme che non sono nell'elenco fornito, e non usare rinvii aperti
  («e ss.», «la normativa in materia»): non sono citazioni.
- Non ricopiare il testo delle segnalazioni e non descrivere episodi
  individuali.
- Non scrivere la sezione «Segnalazioni richiamate» e non scrivere un elenco
  finale dei riferimenti normativi: li aggiunge l'applicazione, e una seconda
  copia produce due liste divergenti nello stesso atto.
- Non scrivere il disclaimer sull'origine automatica della bozza: lo aggiunge
  l'applicazione.
- Non inventare protocolli, PEC, indirizzi o date.

CAMPI OBBLIGATORI: senza anche uno solo di questi l'atto è incompleto e viene
scartato prima della revisione.
  1. destinatario titolare del potere sostitutivo (o il segnaposto) e
     destinatario per conoscenza;
  2. oggetto in una riga, con tipo di atto, data di invio e comune;
  3. formula di sottoscrizione in proprio, con i segnaposto dei dati;
  4. data di invio dell'atto originario e suo oggetto in forma sintetica;
  5. termine di legge con la base normativa, riportata come ti è stata fornita;
  6. dichiarazione che non risulta pervenuto riscontro, con la clausola «ove il
     termine non risulti sospeso o interrotto ai sensi di legge»;
  7. frase sull'eventuale riscontro già adottato;
  8. richiamo espresso all'art. 2, comma 9-ter, della L. 241/1990 nella
     richiesta di esercizio del potere sostitutivo;
  9. frase sulla non trasmissione dei dati identificativi dei segnalanti;
 10. modalità e recapito per il riscontro (con segnaposto);
 11. luogo, data, firma e allegati, con la copia dell'atto originario;
 12. note per la revisione racchiuse fra i due marcatori.`

const SYSTEM_PROMPT = `${REGOLE_COMUNI}

${ISTRUZIONI_SPECIFICHE}`

/**
 * Modello del sollecito.
 *
 * `ruoloDestinatario` è `potere_sostitutivo`: è la figura dell'art. 2, comma
 * 9-bis, e non l'ufficio che ha ricevuto l'atto originario. Nella pratica
 * `pa_endpoints` non lo contiene quasi mai — la tabella dei titolari del potere
 * sostitutivo sta sul sito di ciascuna amministrazione — e l'atto resta perciò
 * con un segnaposto e un controllo esplicito nelle note. È il comportamento
 * corretto: un sollecito mandato allo stesso ufficio silente non attiva alcun
 * rimedio, e uno mandato a un ufficio inventato non arriva da nessuna parte.
 *
 * `firmeObiettivo` è 30, come per gli altri atti diversi dall'esposto
 * (PLAN.md §5.4). Le firme restano un sostegno pubblico: la parte del
 * procedimento è e resta chi ha sottoscritto l'atto originario.
 */
export const sollecito: ModelloAtto = {
  kind: 'sollecito',
  ruoloDestinatario: 'potere_sostitutivo',
  firmeObiettivo: 30,

  titolo: (ctx) =>
    `Sollecito di conclusione del procedimento — ${ctx.cluster.titolo} (${ctx.cluster.citta})`,

  systemPrompt: SYSTEM_PROMPT,

  userPrompt: (ctx) => {
    const { cluster, citazioni, destinatario, attoPrecedente } = ctx

    const bloccoDestinatario = destinatario
      ? `${destinatario}\n` +
        'Usa questo destinatario alla lettera: proviene dall\'elenco verificato dei contatti della pubblica amministrazione.\n' +
        'Fra le note per la revisione chiedi comunque di confermare che sia il soggetto titolare del potere sostitutivo per quel procedimento.'
      : 'Nessun contatto verificato disponibile per il titolare del potere sostitutivo.\n' +
        'Scrivi come destinatario il segnaposto [DA COMPLETARE: soggetto o unità organizzativa titolare del potere sostitutivo ai sensi dell\'art. 2, comma 9-bis, L. 241/1990 — reperibile nella tabella pubblicata sul sito istituzionale dell\'amministrazione], seguito da [DA COMPLETARE: indirizzo PEC].\n' +
        'Ripeti l\'avvertenza fra le note per la revisione. Non dedurre e non inventare un ufficio o un indirizzo.'

    const bloccoPrecedente = attoPrecedente
      ? bloccoAttoPrecedente(attoPrecedente)
      : 'DATI NON DISPONIBILI. Senza l\'atto originario questo sollecito non è redigibile: ' +
        'scrivi solo l\'intestazione e le note per la revisione, dichiarando che l\'atto ' +
        'non può essere redatto perché mancano gli estremi dell\'atto da sollecitare.'

    const conoscenza = attoPrecedente?.destinatario
      ? `Per conoscenza, indica: ${attoPrecedente.destinatario}`
      : 'Per conoscenza, indica il segnaposto [DA COMPLETARE: ufficio destinatario dell\'atto originario].'

    return `MATERIALE PER IL SOLLECITO. Non uscire da qui: ciò che non è scritto sotto non esiste.

ATTO RIMASTO SENZA RISCONTRO
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
Servono al massimo per un capoverso: l'oggetto di questo atto è il procedimento.
${formattaCitazioni(citazioni)}

RIFERIMENTI NORMATIVI DISPONIBILI
Sono gli unici citabili. Il fondamento della richiesta è l'art. 2, comma 9-ter,
della L. 241/1990.
${formattaRiferimenti(RIFERIMENTI)}

COMPITO
Scrivi il sollecito seguendo la struttura, i campi obbligatori e i divieti che
ti sono stati dati. Le date e i giorni li trovi nel blocco dell'atto rimasto
senza riscontro: trascrivili, non ricalcolarli e non arrotondarli. Quando un
elemento non è determinato dal materiale, lascia un segnaposto fra parentesi
quadre e annotalo fra le note per la revisione.`
  },

  riferimenti: RIFERIMENTI,

  /**
   * Quindici giorni, e non è un numero scelto: è «un termine pari alla metà di
   * quello originariamente previsto» (art. 2, comma 9-ter) applicato all'unico
   * procedimento da cui questo atto può nascere.
   *
   * La catena definita in `action_follow_up_kind()` porta al sollecito solo da
   * `diffida_pa` — il cui termine è quello ordinario di trenta giorni dell'art.
   * 2, comma 2 — e da `mozione_consigliere`, che però non ha termine di legge e
   * quindi non attiva mai lo scadenzario. La metà di trenta è quindici.
   *
   * Se un giorno il sollecito diventasse il seguito di un atto con un termine
   * diverso, questo numero sarebbe sbagliato: per questo `base` scrive per
   * esteso da dove viene, così che chi rivede la catena veda subito il legame.
   */
  termine: {
    giorni: 15,
    base:
      'art. 2, comma 9-ter, L. 241/1990 — 15 giorni, pari alla metà del termine ' +
      'ordinario di 30 giorni previsto dall\'art. 2, comma 2, per il procedimento ' +
      'originario',
  },
}
