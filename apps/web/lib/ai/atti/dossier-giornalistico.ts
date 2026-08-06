/**
 * Dossier per la stampa.
 *
 * Non è un atto giuridico: non chiede nulla a nessuno e non denuncia nessuno.
 * È materiale di lavoro per una redazione, e vale esattamente quanto vale la
 * sua nota metodologica. Un cronista cestina in dieci secondi ciò che somiglia
 * a un comunicato militante, e cestina anche ciò che non gli dice da dove
 * vengono i numeri.
 *
 * Per questo il modello qui sotto è più severo degli altri su tre punti.
 *
 * 1. I limiti dei dati vanno dichiarati dal dossier stesso: segnalazioni
 *    spontanee e autoselezionate, non un campione statistico; racconti
 *    riferiti, non fatti accertati.
 *
 * 2. QUELLO CHE IL MODELLO RICEVE NON È QUELLO CHE IL CITTADINO HA DICHIARATO.
 *    La `data` di ogni citazione è il momento in cui il messaggio è arrivato a
 *    VOCE (`reports.created_at`), non la data dell'episodio: un messaggio
 *    scritto alle 00:30 su un'attesa notturna risulta datato al giorno dopo.
 *    Il `luogo` è `reports.location_hint`, estratto automaticamente dal triage,
 *    non una frase scritta dal cittadino. Presentarli come dichiarazioni è il
 *    modo più rapido di far smentire il dossier: una redazione seria chiede
 *    all'ente i dati di quel giorno, l'ente risponde che non risulta nulla, e
 *    i firmatari sono bruciati.
 *
 * 3. QUI SI TRATTANO CATEGORIE PARTICOLARI DI DATI (art. 9 GDPR): stati di
 *    salute, e a volte minori. REGOLE_COMUNI vieta i nomi, ma per identificare
 *    una persona il nome non serve. Data di ricezione, struttura e sintomo,
 *    messi sulla stessa riga, bastano a chi ha il registro degli accessi: il
 *    paziente e chi lo accompagnava — cioè spesso chi ha scritto a VOCE —
 *    sono raggiungibili in pochi minuti, e proprio dalla struttura che il
 *    dossier mette in discussione. Il blocco REGOLE_DATI_SENSIBILI esiste per
 *    questo e non è negoziabile.
 *
 * Il blocco DISCLAIMER_AI, il conteggio delle firme e l'elenco «Segnalazioni
 * richiamate» NON sono scritti dal modello: li aggiungono `componiAtto()` in
 * `dossier.ts`, la pagina pubblica e il PDF al momento del rendering. Il
 * modello che li riscrivesse produrrebbe due elenchi divergenti e renderebbe
 * inverificabile la numerazione [1]-[n], che è l'unica cosa che rende
 * utilizzabile un dossier.
 */

import type {
  ContestoAtto,
  ModelloAtto,
  RiferimentoNormativo,
  SegnalazioneCitabile,
} from './tipi'
import { REGOLE_COMUNI } from './tipi'

/**
 * Sezioni obbligatorie del dossier.
 *
 * Servono a due cose: costruire la checklist finale del system prompt e dare
 * a chi valida l'output un elenco da confrontare con i titoli prodotti. Un
 * dossier senza nota metodologica non è un dossier a metà: è un volantino.
 *
 * «Segnalazioni richiamate» NON è in elenco di proposito: la aggiunge
 * `componiAtto()` a valle. Chiederla anche al modello significherebbe
 * consegnare alla redazione due elenchi che possono divergere per ordine o
 * contenuto.
 */
export const SEZIONI_DOSSIER = [
  'In sintesi',
  'Cronologia delle segnalazioni',
  'I numeri',
  "Che cosa è già stato chiesto all'amministrazione",
  'Che cosa resta senza risposta',
  'Nota metodologica',
] as const

/**
 * Un riferimento verificato più le condizioni alle quali può comparire nel
 * dossier.
 *
 * Stessa struttura di `esposto-procura.ts`, per la stessa ragione: il vincolo
 * d'uso conta quanto il testo della norma. Indicare l'accesso civico
 * generalizzato come strumento disponibile senza sapere chi gestisce la
 * struttura significa mandare una redazione a depositare l'istanza sbagliata
 * al soggetto sbagliato, con il nostro nome sopra.
 */
interface UsableReference {
  reference: RiferimentoNormativo
  /** Quando e in che forma il riferimento può entrare nel dossier. */
  usage: string
}

/**
 * Riferimenti verificati uno per uno il 4 agosto 2026, aprendo la pagina
 * indicata nel campo `fonte`: Normattiva (Istituto Poligrafico e Zecca dello
 * Stato) per le fonti primarie, sito del Garante per la protezione dei dati
 * personali per le regole deontologiche.
 *
 * Sono tutti facoltativi: un dossier per la stampa può non citarne nessuno.
 * Ognuno però viene stampato in coda all'atto da `componiAtto()`, anche se il
 * testo non lo usa — quindi in questo elenco non entra nulla che non sia
 * pertinente a un dossier giornalistico. Per questo motivo l'art. 2, comma 2,
 * L. 241/1990 è stato rimosso: il suo termine di trenta giorni riguarda le
 * amministrazioni statali e gli enti pubblici nazionali, mentre per l'accesso
 * civico vale la disciplina speciale dell'art. 5, comma 6, D.Lgs. 33/2013.
 * Lasciarlo in coda offriva un secondo modo di scrivere «doveva rispondere in
 * trenta giorni» proprio dove quel termine non si applica.
 */
const CATALOGO_RIFERIMENTI: readonly UsableReference[] = [
  {
    reference: {
      citazione: 'art. 2-bis, comma 1, D.Lgs. 14 marzo 2013, n. 33',
      contenuto:
        'Ai fini del decreto sulla trasparenza, per «pubbliche amministrazioni» si ' +
        "intendono tutte le amministrazioni di cui all'articolo 1, comma 2, del " +
        'decreto legislativo 30 marzo 2001, n. 165, ivi comprese le autorità ' +
        'portuali e le autorità amministrative indipendenti di garanzia, vigilanza ' +
        'e regolazione. Il comma 3 dello stesso articolo estende la disciplina ai ' +
        'soggetti privati che svolgono attività di pubblico interesse soltanto ' +
        '«limitatamente ai dati e ai documenti inerenti all\'attività di pubblico ' +
        'interesse»: per un soggetto privato, quindi, il regime non è lo stesso.',
      fonte:
        'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2013-03-14;33~art2bis',
    },
    usage:
      "serve a stabilire SE l'accesso civico si applichi al soggetto di cui parla il " +
      'dossier. Poiché il dossier dichiara di non aver identificato con certezza la ' +
      'struttura, non puoi qualificarla giuridicamente: usa questo riferimento solo ' +
      'per esplicitare la condizione e la lacuna, mai per affermare che i dati sono ' +
      "detenuti da una pubblica amministrazione.",
  },
  {
    reference: {
      citazione: 'art. 1, comma 2, D.Lgs. 30 marzo 2001, n. 165',
      contenuto:
        'Elenca le amministrazioni pubbliche e vi comprende espressamente «le ' +
        'amministrazioni, le aziende e gli enti del Servizio sanitario nazionale», ' +
        'oltre alle Regioni, alle Province, ai Comuni e agli enti pubblici non ' +
        'economici nazionali, regionali e locali.',
      fonte:
        'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2001-03-30;165~art1',
    },
    usage:
      "solo insieme all'art. 2-bis, comma 1, D.Lgs. 33/2013, per dire a quale " +
      'condizione la struttura rientrerebbe fra le pubbliche amministrazioni. Una ' +
      'struttura privata, ancorché accreditata, non è in questo elenco: se non sai ' +
      'chi gestisce la struttura, la condizione resta aperta e va scritta come tale.',
  },
  {
    reference: {
      citazione: 'art. 5, commi 2 e 3, D.Lgs. 14 marzo 2013, n. 33',
      contenuto:
        'Comma 2: allo scopo di favorire forme diffuse di controllo sul perseguimento ' +
        "delle funzioni istituzionali e sull'utilizzo delle risorse pubbliche e di " +
        'promuovere la partecipazione al dibattito pubblico, chiunque ha diritto di ' +
        'accedere ai dati e ai documenti detenuti dalle pubbliche amministrazioni, ' +
        'ulteriori rispetto a quelli oggetto di pubblicazione ai sensi del decreto, ' +
        'nel rispetto dei limiti relativi alla tutela di interessi giuridicamente ' +
        "rilevanti secondo quanto previsto dall'articolo 5-bis. Comma 3: l'esercizio " +
        'del diritto non è sottoposto ad alcuna limitazione quanto alla legittimazione ' +
        "soggettiva del richiedente e l'istanza non richiede motivazione.",
      fonte:
        'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2013-03-14;33~art5',
    },
    usage:
      'nella sezione «Che cosa è già stato chiesto all\'amministrazione», per indicare ' +
      'con quale strumento i dati mancanti sarebbero richiedibili. Sempre in forma ' +
      'condizionata alla natura del soggetto. Il comma 3 è il dato che rende lo ' +
      'strumento immediatamente utilizzabile da una redazione: nessuna legittimazione ' +
      "da dimostrare, nessuna motivazione da scrivere. Non riassumere l'art. 5-bis: " +
      'non ti è stato fornito e non sai che cosa dice.',
  },
  {
    reference: {
      citazione: 'art. 5, commi 5 e 6, D.Lgs. 14 marzo 2013, n. 33',
      contenuto:
        'Comma 6: il procedimento di accesso civico deve concludersi con provvedimento ' +
        'espresso e motivato nel termine di trenta giorni dalla presentazione ' +
        "dell'istanza, con comunicazione al richiedente e agli eventuali " +
        'controinteressati; in caso di accoglimento nonostante l\'opposizione del ' +
        'controinteressato, i dati sono trasmessi non prima di quindici giorni da ' +
        'quella comunicazione. Comma 5: i controinteressati possono opporsi entro ' +
        'dieci giorni dalla ricezione della comunicazione e, a decorrere dalla ' +
        'comunicazione ai controinteressati, il termine di trenta giorni è SOSPESO ' +
        "fino all'eventuale opposizione.",
      fonte:
        'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2013-03-14;33~art5',
    },
    usage:
      'per indicare il termine entro cui va dato riscontro. I trenta giorni non sono ' +
      'mai un termine secco: se esistono controinteressati il termine si sospende. In ' +
      'un dossier che riguarda persone e stati di salute i controinteressati sono la ' +
      'regola, non l\'eccezione. Se citi il termine devi citare anche la sospensione.',
  },
  {
    reference: {
      citazione: 'art. 5, commi 7 e 8, D.Lgs. 14 marzo 2013, n. 33',
      contenuto:
        'Comma 7: in caso di diniego totale o parziale, o di mancata risposta entro il ' +
        'termine del comma 6, il richiedente può presentare richiesta di riesame al ' +
        'responsabile della prevenzione della corruzione e della trasparenza, che ' +
        'decide con provvedimento motivato entro venti giorni; contro la decisione è ' +
        'proponibile ricorso al Tribunale amministrativo regionale ai sensi ' +
        "dell'articolo 116 del Codice del processo amministrativo (D.Lgs. 2 luglio " +
        '2010, n. 104). Comma 8: se si tratta di atti delle amministrazioni delle ' +
        'regioni o degli enti locali, il richiedente può altresì presentare ricorso al ' +
        'difensore civico competente per ambito territoriale, ove costituito; il ' +
        'difensore civico si pronuncia entro trenta giorni e, se ritiene illegittimo ' +
        "il diniego, lo comunica all'amministrazione: se questa non conferma il diniego " +
        'entro trenta giorni, l\'accesso è consentito.',
      fonte:
        'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2013-03-14;33~art5',
    },
    usage:
      'insieme al termine, mai da solo e mai omesso quando il termine è citato. Un ' +
      'termine senza rimedio è mezzo strumento: la redazione presenta l\'istanza, ' +
      'l\'ente tace, e la storia muore lì. Il canale del comma 8 riguarda gli atti di ' +
      'regioni ed enti locali ed è il più praticabile per una redazione senza ' +
      'avvocato: indicalo alle stesse condizioni con cui indichi lo strumento, cioè ' +
      'senza qualificare il soggetto che non è stato identificato.',
  },
  {
    reference: {
      citazione: 'art. 9, comma 1, L. 7 giugno 2000, n. 150',
      contenuto:
        "Le amministrazioni pubbliche di cui all'articolo 1, comma 2, del decreto " +
        'legislativo 3 febbraio 1993, n. 29, possono dotarsi, anche in forma associata, ' +
        "di un ufficio stampa, la cui attività è in via prioritaria indirizzata ai " +
        'mezzi di informazione di massa. Il D.Lgs. 29/1993 è stato abrogato ' +
        "dall'articolo 72, comma 1, lettera t), del D.Lgs. 165/2001: il rinvio si legge " +
        "oggi all'articolo 1, comma 2, del D.Lgs. 165/2001, riportato in questo stesso " +
        'elenco. È una facoltà, non un obbligo: non si può dare per scontato che un ' +
        'ente abbia un ufficio stampa.',
      fonte: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:2000-06-07;150~art9',
    },
    usage:
      'solo per spiegare alla redazione perché il dossier non indica un ufficio stampa ' +
      "come interlocutore certo. Non usarlo per affermare che l'ente ne ha uno, né per " +
      'sostenere che avrebbe dovuto rispondere: la norma attribuisce una facoltà.',
  },
  {
    reference: {
      citazione: 'art. 2, L. 3 febbraio 1963, n. 69',
      contenuto:
        'È diritto insopprimibile dei giornalisti la libertà di informazione e di ' +
        'critica, limitata dall\'osservanza delle norme di legge dettate a tutela della ' +
        'personalità altrui, ed è loro obbligo inderogabile il rispetto della verità ' +
        'sostanziale dei fatti, osservati sempre i doveri imposti dalla lealtà e dalla ' +
        'buona fede. Devono essere rettificate le notizie che risultino inesatte e ' +
        'riparati gli eventuali errori.',
      fonte: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:1963-02-03;69~art2',
    },
    usage:
      'al più una volta, nella nota metodologica, accanto all\'impegno di rettifica. ' +
      'Non usarlo per dire alla redazione che cosa deve fare: è un dovere del ' +
      'giornalista, non una richiesta di VOCE.',
  },
  {
    reference: {
      citazione:
        'art. 6 delle Regole deontologiche relative al trattamento dei dati ' +
        "personali nell'esercizio dell'attività giornalistica (Garante per la " +
        'protezione dei dati personali, provv. 29 novembre 2018, n. 491, in G.U. ' +
        'n. 3 del 4 gennaio 2019)',
      contenuto:
        "Principio di essenzialità dell'informazione: la divulgazione di notizie di " +
        'rilevante interesse pubblico o sociale non contrasta con il rispetto della ' +
        "sfera privata quando l'informazione, anche dettagliata, è indispensabile in " +
        'ragione della originalità del fatto, della descrizione dei modi particolari ' +
        'in cui è avvenuto o della qualificazione dei protagonisti.',
      fonte: 'https://www.garanteprivacy.it/home/docweb/-/docweb-display/docweb/9067692',
    },
    usage:
      'nella nota metodologica, per spiegare perché il dossier riporta meno dettagli ' +
      'di quanti ne contengano le segnalazioni. È una norma permissiva: non citarla ' +
      'mai da sola, perché da sola sembra autorizzare la pubblicazione di tutto. Va ' +
      'sempre accompagnata dagli artt. 7 e 10 dello stesso provvedimento.',
  },
  {
    reference: {
      citazione:
        'art. 7 (Tutela del minore) delle Regole deontologiche relative al ' +
        "trattamento dei dati personali nell'esercizio dell'attività giornalistica " +
        '(Garante per la protezione dei dati personali, provv. 29 novembre 2018, ' +
        'n. 491, in G.U. n. 3 del 4 gennaio 2019)',
      contenuto:
        'Al fine di tutelarne la personalità, il giornalista non pubblica i nomi dei ' +
        'minori coinvolti in fatti di cronaca, né fornisce particolari in grado di ' +
        'condurre alla loro identificazione. Il diritto del minore alla riservatezza ' +
        'deve essere sempre considerato come primario rispetto al diritto di critica ' +
        'e di cronaca.',
      fonte: 'https://www.garanteprivacy.it/home/docweb/-/docweb-display/docweb/9067692',
    },
    usage:
      'nella nota metodologica, insieme all\'art. 10, per accompagnare qualunque ' +
      'materiale reso disponibile alla redazione. Ed è la ragione per cui la minore ' +
      'età non compare mai nel dossier accanto a una data, a una struttura o a una ' +
      'circostanza clinica: il divieto riguarda i «particolari in grado di condurre ' +
      "all'identificazione», non solo il nome.",
  },
  {
    reference: {
      citazione:
        'art. 10 (Tutela della dignità delle persone malate) delle Regole ' +
        'deontologiche relative al trattamento dei dati personali nell\'esercizio ' +
        "dell'attività giornalistica (Garante per la protezione dei dati personali, " +
        'provv. 29 novembre 2018, n. 491, in G.U. n. 3 del 4 gennaio 2019)',
      contenuto:
        'Il giornalista, nel far riferimento allo stato di salute di una determinata ' +
        'persona, identificata o identificabile, ne rispetta la dignità, il diritto ' +
        'alla riservatezza e al decoro personale, specie nei casi di malattie gravi o ' +
        'terminali, e si astiene dal pubblicare dati analitici di interesse ' +
        'strettamente clinico.',
      fonte: 'https://www.garanteprivacy.it/home/docweb/-/docweb-display/docweb/9067692',
    },
    usage:
      'nella nota metodologica, per spiegare perché i dettagli sanitari compaiono solo ' +
      'in forma aggregata e senza data. «Identificabile» è la parola che conta: una ' +
      'persona resta identificabile anche senza nome, se il dossier fornisce data, ' +
      'struttura e sintomo.',
  },
]

const RIFERIMENTI: RiferimentoNormativo[] = CATALOGO_RIFERIMENTI.map(
  (voce) => voce.reference,
)

const MESI_ITALIANI = [
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre',
]

/**
 * Converte «12 luglio 2026» in un timestamp confrontabile.
 *
 * Restituisce null su qualsiasi forma che non riconosce: meglio non calcolare
 * il periodo che calcolarlo su una data letta male.
 */
function parseDataItaliana(data: string): number | null {
  const match = /^(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\s+(\d{4})$/.exec(data.trim())
  if (!match) return null

  const giorno = Number(match[1])
  const mese = MESI_ITALIANI.indexOf(match[2].toLowerCase())
  const anno = Number(match[3])
  if (mese < 0) return null

  const istante = Date.UTC(anno, mese, giorno)
  const controllo = new Date(istante)
  if (controllo.getUTCDate() !== giorno || controllo.getUTCMonth() !== mese) {
    return null
  }
  return istante
}

/**
 * Arco di RICEZIONE delle segnalazioni citate, calcolato e non stimato.
 *
 * Non è il periodo in cui i fatti sono avvenuti: quello non ci è noto. Se anche
 * una sola data è illeggibile restituisce null, e il dossier dirà l'arco
 * elencando le date invece di dichiararne uno sbagliato.
 */
function periodoCoperto(citazioni: SegnalazioneCitabile[]): string | null {
  if (citazioni.length === 0) return null

  let minIstante = Number.POSITIVE_INFINITY
  let maxIstante = Number.NEGATIVE_INFINITY
  let minData = ''
  let maxData = ''

  for (const citazione of citazioni) {
    const istante = parseDataItaliana(citazione.data)
    if (istante === null) return null
    if (istante < minIstante) {
      minIstante = istante
      minData = citazione.data
    }
    if (istante > maxIstante) {
      maxIstante = istante
      maxData = citazione.data
    }
  }

  if (minData === maxData) return `tutte ricevute in data ${minData}`

  const giorni = Math.round((maxIstante - minIstante) / 86_400_000) + 1
  return `dal ${minData} al ${maxData} (${giorni} giorni)`
}

/**
 * Forma canonica della citazione.
 *
 * Le etichette non sono verbose per abitudine: dicono al modello, dentro il
 * materiale stesso, che cosa ha davanti. La data è quella di arrivo del
 * messaggio, il luogo è un'estrazione automatica del triage. Senza queste due
 * etichette il modello scrive «il 12 luglio, al pronto soccorso X» e mette in
 * bocca a un cittadino una cosa che non ha detto.
 */
function formattaCitazione(citazione: SegnalazioneCitabile): string {
  const luogo = citazione.luogo?.trim()
  const rigaLuogo = luogo
    ? `luogo estratto automaticamente dal triage (NON una dichiarazione del cittadino, non verificato): ${luogo}`
    : 'nessun luogo estratto dal triage'
  return (
    `[${citazione.indice}] segnalazione ricevuta il ${citazione.data} — ` +
    `${rigaLuogo} — testo anonimizzato: «${citazione.testo}»`
  )
}

function formattaRiferimenti(riferimenti: readonly UsableReference[]): string {
  return riferimenti
    .map(
      (voce) =>
        `- ${voce.reference.citazione}\n  ${voce.reference.contenuto}\n` +
        `  Uso ammesso: ${voce.usage}\n  Verificato su: ${voce.reference.fonte}`,
    )
    .join('\n')
}

/** Milano, Corvetto — oppure solo Milano se il quartiere non c'è. */
function luogoCluster(ctx: ContestoAtto): string {
  const { citta, quartiere } = ctx.cluster
  return quartiere ? `${citta}, ${quartiere}` : citta
}

const CHECKLIST_SEZIONI = SEZIONI_DOSSIER.map(
  (sezione) => `- titolo di secondo livello «## ${sezione}»`,
).join('\n')

/**
 * Regole sulle categorie particolari di dati.
 *
 * Stanno in un blocco separato perché sono le uniche il cui costo è
 * irreversibile: un numero sbagliato si rettifica, una persona esposta no.
 */
const REGOLE_DATI_SENSIBILI = `DATI SANITARI E MINORI — REGOLE CHE VENGONO PRIMA DI TUTTE LE ALTRE

Le segnalazioni che ti sono state date possono contenere stati di salute, cioè
categorie particolari di dati personali. Le REGOLE INDEROGABILI ti vietano i
nomi, ma per identificare una persona il nome non serve.

1. MAI la combinazione data + luogo + dettaglio clinico riferita a una singola
   persona. Se una segnalazione dice «il 12 luglio, al pronto soccorso, un
   familiare con dolore al petto», tu puoi scrivere la data e la durata
   dell'attesa, oppure il dettaglio clinico in forma aggregata e senza data, ma
   MAI le tre cose insieme. Chi ha il registro degli accessi risale in pochi
   minuti al paziente e a chi lo accompagnava: cioè al cittadino che ha scritto
   a VOCE, identificato proprio dalla struttura che sta criticando.

2. I dettagli clinici entrano SOLO aggregati e SOLO senza data, nella sezione
   «I numeri»: «due delle cinque segnalazioni citate riferiscono l'attesa di una
   persona con febbre alta». Mai in «Cronologia delle segnalazioni», mai in «In
   sintesi», mai in una domanda.

3. Nessun dato analitico di interesse strettamente clinico: niente diagnosi,
   niente terapie, niente esami, niente codici di priorità attribuiti a una
   singola persona.

4. LA MINORE ETÀ NON COMPARE MAI accanto a una data, a una struttura o a una
   circostanza clinica. Se una segnalazione riguarda un minore, il dossier ne
   riporta solo la circostanza non clinica (per esempio la durata dell'attesa) e
   non scrive che si trattava di un minore. Il divieto deontologico riguarda i
   «particolari in grado di condurre all'identificazione», non solo il nome, e
   la riservatezza del minore prevale sul diritto di cronaca.

5. Nessuna caratteristica personale che restringa il campo: età, condizione di
   disabilità, gravidanza, nazionalità, professione, legame di parentela
   specifico. In un quartiere circoscritto ognuna di queste, unita a una data,
   individua una persona.

6. Se una segnalazione contiene un dettaglio che non puoi riportare, non
   sostituirlo con una perifrasi che dice la stessa cosa: lascialo fuori. Il
   dossier perde un dettaglio, la persona non perde la riservatezza.`

const ISTRUZIONI_DOSSIER = `ATTO DA REDIGERE: DOSSIER PER LA STAMPA

Chi legge è una redazione giornalistica, non un ufficio pubblico. Il dossier non
chiede, non diffida e non denuncia: consegna a chi dovrà verificare i fatti, le
date, i numeri e il metodo con cui sono stati raccolti.

Devi superare due filtri. Il primo: un cronista cestina in dieci secondi
qualunque cosa somigli a un comunicato militante. Il secondo: cestina anche ciò
che non gli dice da dove arrivano i dati e quanto valgono. La nota metodologica
non è un adempimento burocratico in fondo alla pagina: è la parte che rende
utilizzabile tutto il resto.

${REGOLE_DATI_SENSIBILI}

CHE COSA HAI DAVVERO IN MANO

Due cose del materiale non sono quello che sembrano, e confonderle è l'errore
che fa smentire il dossier al primo controllo.

- LA DATA di ogni segnalazione è la data in cui il messaggio è ARRIVATO a VOCE.
  Non è la data dell'episodio. Un messaggio scritto a notte fonda su un'attesa
  notturna risulta datato al giorno dopo. Se il testo della segnalazione dice
  quando è accaduto il fatto, quella è l'unica fonte per la data dell'episodio;
  se non lo dice, il dossier non ha alcuna data dei fatti.
- IL LUOGO accanto a ogni citazione è stato estratto automaticamente dal testo
  da un sistema di smistamento. Non è una dichiarazione del cittadino e non è
  stato verificato. Non scrivere mai «N segnalazioni indicano come luogo X»:
  scrivi «per N delle segnalazioni citate il luogo estratto automaticamente è X».

STRUTTURA, NELL'ORDINE

Intestazione (prima di ogni sezione)
- Titolo di primo livello: «# Dossier per la stampa — segnalazioni su <titolo
  del gruppo> (<comune>)». La forma è attributiva di proposito: il titolo del
  gruppo è una sintesi automatica di segnalazioni non verificate, e questa riga
  finisce nei motori di ricerca e nelle anteprime social. Non trasformarla in
  una constatazione.
- Sotto, su righe separate: la redazione destinataria (o il segnaposto se non ti
  è stata indicata), il comune ed eventualmente la zona a cui si riferiscono le
  segnalazioni, la categoria, l'arco di ricezione delle segnalazioni citate, e
  «Data di trasmissione: [DA COMPLETARE: data]».
- Nessun occhiello, nessun sommario a effetto, nessun titolo giornalistico:
  il titolo lo sceglie la redazione, non noi.

## In sintesi
Al massimo cinque frasi, una per riga. Ognuna contiene un fatto e i suoi rimandi
numerati.
La prima frase dichiara la base dei numeri nella forma: «<N> segnalazioni citate
in questo dossier, su <M> raccolte nel gruppo da <K> cittadini distinti,
riferiscono …». Non attribuire alle segnalazioni non citate alcun contenuto: di
quelle non sai nulla, e affermare che riguardano lo stesso oggetto contraddice
la nota metodologica.
Non scrivere mai «cittadini di <zona>», «residenti in <zona>» o formule
equivalenti: comune e zona sono il luogo a cui si riferiscono le segnalazioni,
non il domicilio di chi le ha scritte. Attribuire una residenza a chi ha
segnalato restringe i firmatari a un insieme piccolo e li rende individuabili.
L'ultima frase dice, senza giri di parole, che cosa NON sappiamo (per esempio:
nessun dato ufficiale a confronto, nessun riscontro dell'amministrazione).
Chi legge solo questa sezione deve poter decidere se la storia lo interessa.

## Cronologia delle segnalazioni
La sezione si chiama così perché è quello che è: l'ordine di arrivo dei
messaggi, non una ricostruzione degli episodi.
Elenco puntato in ordine di data crescente, una riga per data.
Forma: «**Segnalazione ricevuta il 12 luglio 2026** — <circostanza riferita>
[1]».
La circostanza è la sola parte non clinica del racconto: una durata di attesa,
una condizione dei locali, un disservizio. Nessun sintomo, nessuna diagnosi,
nessun riferimento all'età o alla condizione di chi ha subito il fatto, nessun
luogo nella riga.
Non scrivere «il 12 luglio è accaduto», «quel giorno», «nella giornata del»:
qualunque formula che leghi la data al momento del fatto è vietata, in questa
sezione e in tutte le altre.
Riporti solo ciò che la segnalazione dice, con i suoi rimandi. Se più
segnalazioni cadono nello stesso giorno, una sola riga con più rimandi.
Non interpretare, non collegare cause ed effetti, non aggiungere contesto che
nessuno ti ha dato.

## I numeri
Solo quantità che ti sono state fornite o che sai contare sulle citazioni:
quanti cittadini distinti hanno scritto al gruppo, quante segnalazioni contiene
il gruppo, quante ne sono citate qui, in quale arco di ricezione, quante delle
citate riportano una certa circostanza.
Si contano soltanto circostanze che compaiono TESTUALMENTE nelle citazioni. Se
per contare devi interpretare, non contare: descrivi e basta.
Ogni conteggio dichiara la propria base: «3 delle 5 segnalazioni citate», mai
«3 segnalazioni» e basta. Se un conteggio non è ricavabile dalle citazioni, non
lo scrivi. Niente medie, niente percentuali, niente proiezioni, niente stime.
È qui, e solo qui, che un dettaglio clinico può comparire: aggregato, senza data
e senza luogo, nella forma «N delle M segnalazioni citate riferiscono …».
Il conteggio sui luoghi si scrive sempre dichiarando l'estrazione automatica:
«per 4 delle 5 segnalazioni citate il luogo estratto automaticamente è …».

## Che cosa è già stato chiesto all'amministrazione
Che cosa risulta essere già stato chiesto e con quale esito.
Se dalle segnalazioni non risulta alcuna richiesta né alcun riscontro, scrivilo
nella forma esatta: «Nessuna delle <N> segnalazioni citate menziona un reclamo
formale o una risposta ricevuta; il materiale non consente di escludere che
siano stati presentati per altri canali.» Senza rimandi numerati: i rimandi
indicano ciò che una segnalazione DICE, mai ciò che tace. Non scrivere che i
cittadini non hanno reclamato: è un comportamento che nessuno di loro ha
dichiarato, ed è la frase con cui l'amministrazione ribalta il dossier.
Lascia poi «[DA COMPLETARE: atti già trasmessi sullo stesso gruppo, con data,
protocollo ed esito]».
Qui, e solo qui, puoi indicare con quale strumento i dati mancanti sarebbero
richiedibili e in quale termine andrebbe dato riscontro, usando i riferimenti
normativi che ti sono stati forniti. Vincoli inderogabili:
- SEMPRE in forma condizionale e con la lacuna esplicita. Il dossier dichiara di
  non aver identificato la struttura: non puoi qualificarla giuridicamente.
  Forma ammessa: «se la struttura è gestita da un'azienda o da un ente del
  Servizio sanitario nazionale, i dati sono richiedibili con l'accesso civico
  generalizzato …; la natura del soggetto che gestisce la struttura non risulta
  dalle segnalazioni: [DA COMPLETARE: ente titolare della struttura]».
- Non scrivere mai, in forma assertiva, che i dati «sono detenuti da una
  pubblica amministrazione».
- Se citi il termine di trenta giorni, cita nella stessa frase la sospensione
  per i controinteressati. Non calcolare mai una scadenza: non sai se vi siano
  controinteressati, e in un dossier che riguarda stati di salute ci sono quasi
  sempre.
- Se indichi il termine, indica anche il rimedio in caso di silenzio: riesame e
  ricorso al difensore civico sono la parte utile per una redazione.
- Non scrivere che un termine è scaduto: non ti risulta la data di alcuna
  richiesta.
Chiudi il capoverso segnalando che le indicazioni procedurali vanno confermate
da una persona competente prima di essere usate.

## Che cosa resta senza risposta
Da quattro a sei domande, numerate, che la redazione può girare
all'amministrazione. Ogni domanda nasce da un fatto citato e ne richiama il
numero. Sono domande vere, verificabili, con un destinatario possibile: non
domande retoriche e non accuse travestite da domanda.
REGOLA CHE VALE PER OGNI DOMANDA: ogni cifra, soglia, categoria o causa
contenuta in una domanda deve comparire TESTUALMENTE in una delle segnalazioni
citate. Se nessuna segnalazione parla di dodici ore, non esiste una domanda
sulle dodici ore; se nessuna parla di codici di priorità, di posti letto
dedicati o di sovraffollamento, quelle parole non entrano in una domanda. Una
domanda non è un luogo neutro: chi legge trattiene il numero, non il punto
interrogativo, e su quel numero i firmatari verranno smentiti.
Non usare rimandi numerati a sostegno di ciò che le segnalazioni non dicono, e
non citare a sostegno di una soglia una segnalazione che dichiara di non
indicare la durata.
Nessuna domanda contiene un dettaglio clinico, una data accostata a una persona
o un riferimento alla minore età.
Chiudi ricordando che la versione dell'amministrazione non è stata richiesta né
ottenuta, e lascia il segnaposto per il recapito dell'ente competente.

## Nota metodologica
È la sezione che ti prendi il tempo di scrivere bene. Se contraddice il resto
del documento, il documento è da buttare: verifica che ogni cosa scritta sopra
sia coerente con quanto dichiari qui. In paragrafi brevi o elenchi puntati, deve
dire almeno:
1. Origine dei dati: messaggi spontanei inviati dai cittadini alla piattaforma
   VOCE tramite messaggistica o modulo web. Nessuna intervista, nessun
   sopralluogo, nessun campionamento.
2. A chi hanno scritto: riporta questo contenuto senza attenuarlo. «Le
   segnalazioni sono state inviate alla piattaforma VOCE, non a questa
   redazione. Chi ha scritto non ha scelto la trasmissione alla stampa: la
   decisione è di VOCE, che per questo trasmette solo testi anonimizzati e
   nessun recapito. Non chiedere a VOCE il contatto di chi ha segnalato.»
3. Che cosa è stato letto: soltanto il testo anonimizzato di ogni segnalazione.
   L'anonimizzazione è automatica e va dichiarata per quello che è: «I testi
   sono anonimizzati automaticamente prima di essere letti; la rimozione dei
   dati identificativi non è garantita e ogni segnalazione di dato residuo va
   inviata a [DA COMPLETARE: recapito per le segnalazioni di dati residui].»
   Non scrivere mai che nomi, indirizzi o dettagli identificativi «sono stati
   rimossi»: è un'affermazione assoluta su un processo automatico, e basta un
   soprannome o un dettaglio unico perché sia falsa.
4. Che cosa NON è una dichiarazione del cittadino: il luogo accanto a ogni
   citazione non è una frase scritta da chi ha segnalato, è estratto
   automaticamente dal testo e non è stato verificato.
5. Che cosa sono le date: la data indicata è quella di RICEZIONE del messaggio,
   non quella dell'episodio. Dillo con questa chiarezza e, se i testi citati non
   dichiarano quando i fatti sarebbero avvenuti, scrivi che il dossier non
   contiene date degli episodi.
6. Come è stato costruito il gruppo: accostamento automatico per somiglianza dei
   testi, seguito da revisione umana della bozza.
7. Che cosa contano i numeri: i «cittadini» sono le persone che hanno scritto,
   non necessariamente quelle che hanno subito il fatto; in alcune segnalazioni
   chi scrive riferisce l'attesa o il disagio di un'altra persona, e il materiale
   non consente di dire in quanti casi. Le «segnalazioni» sono messaggi
   ricevuti, non episodi distinti verificati: la stessa persona può aver scritto
   più volte, e non è noto da quanti cittadini distinti provengano le
   segnalazioni citate. Nessuna di queste quantità va stimata.
8. Rapporto fra gruppo e citazioni: quante segnalazioni contiene il gruppo e
   quante ne sono citate; ogni numero dichiara a quale delle due basi si
   riferisce. Le segnalazioni non citate non sono state usate per alcun
   conteggio e di esse il dossier non afferma nulla.
9. Perché il dossier dice meno di quanto sa: il nome della struttura non è
   riportato perché non risulta dalle segnalazioni, ma comune, zona e date qui
   indicati possono comunque renderla individuabile — quindi la riduzione del
   dettaglio non è una cortesia, è una necessità. I dettagli sanitari compaiono
   solo in forma aggregata e senza data, e nessun riferimento è fatto alla
   minore età di chi ha subito i fatti. Cita qui, se li usi, i riferimenti
   deontologici che ti sono stati forniti.
10. LIMITI, in modo esplicito e senza attenuazioni. Come minimo:
   - le segnalazioni sono spontanee e autoselezionate: chi scrive lo fa perché ha
     avuto un problema. Non sono un campione statistico e non sono
     rappresentative della popolazione interessata. Da questi dati non si ricava
     né la frequenza del fenomeno né una media;
   - i racconti non sono stati verificati in modo indipendente: sono
     dichiarazioni di chi ha scritto alla piattaforma, non fatti accertati, e il
     materiale non consente di distinguere l'esperienza diretta dal racconto
     riferito da altri. Non definirle mai «di prima mano»;
   - chi non usa messaggistica non è rappresentato; composizione per età, lingua
     e quartiere di chi scrive non è nota né controllata;
   - la copertura geografica dipende da dove la piattaforma è conosciuta: più
     segnalazioni in una zona non significano un problema peggiore in quella zona;
   - il periodo osservato è breve: non consente di affermare un peggioramento né
     un miglioramento;
   - non c'è confronto con dati ufficiali, che restano da chiedere e da leggere
     alla redazione.
11. Disponibilità e rettifica: i testi originali non sono condivisibili. Sulla
   condivisione dei testi anonimizzati NON prendere alcun impegno: scrivi
   esattamente «[DA COMPLETARE: valutare quali testi anonimizzati possono essere
   condivisi con la redazione, e a quali condizioni]». Aggiungi che il materiale
   riguarda stati di salute di persone identificabili e, se ricorre, minori, e
   che la sua eventuale consegna resta soggetta ai doveri di tutela richiamati
   sopra. Dichiara infine che ogni inesattezza documentata viene corretta e la
   correzione resa pubblica, e lascia il segnaposto per il recapito.

REGISTRO
Italiano piano, da nota informativa. Frasi corte. Verbi al presente o al passato
prossimo. Uso sistematico delle forme che segnalano la fonte: «la segnalazione
riferisce», «risulta da», «secondo quanto scritto da chi ha segnalato». Non
scrivere mai un fatto riferito come se fosse accertato.

COSA NON FARE, MAI
- Nessun aggettivo che non aggiunga un fatto. Sono fuori: drammatico,
  vergognoso, inaccettabile, gravissimo, al collasso, emergenza, scandalo, caos,
  odissea, calvario. Se una di queste parole compare in una segnalazione, resta
  dentro le virgolette della citazione e non entra nella tua prosa.
- Nessun appello, nessuna richiesta alla redazione di «denunciare» o «dare
  voce». Nessun riferimento alle firme raccolte o da raccogliere: il conteggio
  delle firme viene aggiunto automaticamente e non lo scrivi tu.
- Nessuna causa attribuita (tagli, carenza di personale, cattiva gestione) se
  non è scritta in una segnalazione: al massimo diventa una domanda della
  sezione «Che cosa resta senza risposta», e solo con le parole che la
  segnalazione usa.
- Nessun confronto con altre città, altri periodi o medie nazionali: non hai
  quei dati.
- Nessun nome di persona fisica. Nessuna struttura nominata oltre a come la
  nominano le segnalazioni: se dicono «pronto soccorso cittadino», il dossier
  scrive «pronto soccorso cittadino». Non presentare questa reticenza come una
  protezione: la nota metodologica deve dire che il nome non è riportato perché
  non risulta dalle segnalazioni e che comune, zona e date possono comunque
  rendere la struttura individuabile.
- Nessun impegno di divulgazione, di consegna di materiale o di contatto preso
  per conto di VOCE: dove servirebbe una decisione, lasci un segnaposto.
- Nessuna sezione «Segnalazioni richiamate»: l'elenco numerato con date e luoghi
  viene aggiunto automaticamente in coda al documento. Se lo scrivi tu, il
  dossier arriva alla redazione con due elenchi che possono divergere e la
  numerazione [1]-[n] smette di essere verificabile.
- Nessun disclaimer sull'uso dell'AI scritto da te: viene aggiunto
  automaticamente alla pagina e al PDF.
- Nessun grassetto d'enfasi: il grassetto si usa solo per le righe della
  cronologia e per i capoversi-guida della nota metodologica.

LUNGHEZZA
Fra 900 e 1500 parole. È un documento di consultazione, non un articolo: «In
sintesi» è la parte che si legge in trenta secondi, il resto serve a chi
verifica. La nota metodologica può occupare fino a un terzo del testo: non
tagliare lì per rientrare nei limiti.

CAMPI OBBLIGATORI — se ne manca uno il dossier non è utilizzabile e va rigenerato
- intestazione con la redazione destinataria, o il suo segnaposto esplicito
- arco di ricezione delle segnalazioni citate
${CHECKLIST_SEZIONI}
- almeno un rimando numerato [n] in «In sintesi» e in «Cronologia delle
  segnalazioni»
- in «Nota metodologica»: il punto su a chi hanno scritto i cittadini, il punto
  sulla provenienza automatica di luogo e data, il punto sui limiti dei dati e
  il segnaposto sulla condivisione dei testi anonimizzati`

export const dossierGiornalistico: ModelloAtto = {
  kind: 'dossier_giornalistico',
  ruoloDestinatario: 'stampa',
  firmeObiettivo: 30,

  // Forma attributiva, non assertiva: questa stringa diventa l'<h1> della
  // pagina pubblica e il <title> nelle anteprime social. «Dossier — Attese
  // oltre sei ore» è una constatazione che nessuna prova sostiene; «segnalazioni
  // su …» dice esattamente ciò che il dossier contiene e costa quattro parole.
  titolo: (ctx) =>
    `Dossier per la stampa — segnalazioni su ${ctx.cluster.titolo} (${luogoCluster(ctx)})`,

  systemPrompt: `${REGOLE_COMUNI}

---

${ISTRUZIONI_DOSSIER}`,

  userPrompt: (ctx) => {
    const { cluster, citazioni, destinatario } = ctx
    const periodo = periodoCoperto(citazioni)

    const righeNumeri = [
      `- Cittadini distinti che hanno scritto al gruppo: ${cluster.cittadini}`,
      `- Segnalazioni raccolte nel gruppo: ${cluster.segnalazioni}`,
      `- Segnalazioni citabili in questo dossier: ${citazioni.length}`,
      periodo === null
        ? '- Arco di ricezione delle segnalazioni citate: ricavalo dalle date elencate qui sotto, senza calcolare durate'
        : `- Arco di ricezione delle segnalazioni citate: ${periodo}`,
    ].join('\n')

    const rigaDestinatario =
      destinatario === null
        ? 'Redazione destinataria: NON ANCORA INDIVIDUATA. Nell\'intestazione scrivi esattamente «[DA COMPLETARE: redazione destinataria]» e non inventare un nome di testata.'
        : `Redazione destinataria: ${destinatario}`

    const elencoCitazioni =
      citazioni.length === 0
        ? 'NESSUNA SEGNALAZIONE CITABILE. Non scrivere il dossier: rispondi con la sola riga «[BLOCCATO: nessuna segnalazione citabile]».'
        : citazioni.map(formattaCitazione).join('\n')

    return `MATERIALE PER IL DOSSIER

GRUPPO DI SEGNALAZIONI
- Titolo: ${cluster.titolo}
- Riassunto: ${cluster.riassunto}
  Il riassunto serve solo a orientarti: non è una fonte, non ha rimandi numerati
  e non può essere citato. È stato prodotto automaticamente e può pluralizzare
  una circostanza che una sola segnalazione riferisce, o presentare come
  caratteristica del gruppo ciò che una sola persona ha scritto. Ogni fatto
  scritto nel dossier deve venire da una segnalazione numerata e portarne il
  rimando.
- Categoria: ${cluster.categoria}
- Comune a cui si riferiscono le segnalazioni (NON la residenza di chi ha scritto): ${cluster.citta}
- Zona o quartiere a cui si riferiscono le segnalazioni (NON la residenza di chi ha scritto): ${cluster.quartiere ?? 'non indicata'}

NUMERI ACCERTATI — riportali come sono, non arrotondarli, non derivarne altri
${righeNumeri}

I cittadini distinti e le segnalazioni raccolte si riferiscono all'INTERO
gruppo. Non ti è noto da quanti cittadini distinti provengano le segnalazioni
citate qui sotto: non attribuire a «i cittadini» ciò che risulta dalle
citazioni, e non attribuire alle segnalazioni non citate alcun contenuto.

${rigaDestinatario}

SEGNALAZIONI CITABILI — usa esattamente questi numeri fra parentesi quadre
${elencoCitazioni}

RIFERIMENTI NORMATIVI VERIFICATI — gli unici che puoi citare, e solo se servono
${formattaRiferimenti(CATALOGO_RIFERIMENTI)}

Nessuno di questi riferimenti è obbligatorio: un dossier per la stampa può non
citarne nemmeno uno. Citane uno solo dove aggiunge un fatto utile alla redazione
e solo alle condizioni d'uso indicate accanto a ciascuno. Non citare articoli
diversi da questi, nemmeno se li ricordi, e non riassumere norme richiamate al
loro interno che non ti sono state fornite: se ti servisse una norma che non è
in elenco, scrivi il dossier senza e segnala la lacuna nella nota metodologica.

Scrivi ora il dossier, in Markdown, seguendo la struttura e i campi obbligatori.`
  },

  riferimenti: RIFERIMENTI,

  /**
   * Nessun termine: il destinatario non è una pubblica amministrazione.
   *
   * Una redazione non ha alcun obbligo di rispondere a chi le manda materiale,
   * e non esiste norma che le assegni un termine. Contare i giorni qui
   * significherebbe promettere ai cittadini una risposta che nessuno deve loro:
   * è esattamente il tipo di promessa che PLAN2 §1.1 esiste per non ripetere.
   */
  termine: null,
}
