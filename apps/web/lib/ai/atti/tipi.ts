/**
 * Contratto comune dei modelli di atto.
 *
 * Ogni tipo di atto vive in un file separato di questa cartella ed esporta un
 * `ModelloAtto`. `dossier.ts` li mette in fila senza sapere nulla del loro
 * contenuto giuridico.
 *
 * Regola che vale per tutti, senza eccezioni: quello che esce da qui finisce
 * davanti a una Procura, a un Responsabile della trasparenza o a una redazione.
 * Un atto sbagliato non è un bug — è un danno alla credibilità dei cittadini
 * che l'hanno firmato.
 */

import type { ActionKind } from '@voce/db'

/** Una segnalazione, già anonimizzata, pronta per essere citata nell'atto. */
export interface SegnalazioneCitabile {
  /** Numero con cui l'atto la richiama: [1], [2], … */
  indice: number
  /** Data in formato italiano, senza orario. */
  data: string
  /** Luogo dichiarato dal cittadino, se c'era. */
  luogo: string | null
  /** SOLO anon_text: il testo grezzo non esce mai da qui. */
  testo: string
}

/**
 * L'atto già inviato di cui quello nuovo è il seguito.
 *
 * Esiste solo per gli atti dello scadenzario (sollecito, riesame): un sollecito
 * che non dice quale istanza sollecita e quando è scaduto il termine non è un
 * sollecito, è una seconda lettera. Le date sono già in formato italiano perché
 * il modello non deve calcolare niente: deve solo trascrivere.
 */
export interface AttoPrecedente {
  kind: ActionKind
  /** Come si chiama in italiano: «Accesso civico», «Diffida…». */
  etichetta: string
  /** Titolo con cui l'atto è stato protocollato dalla piattaforma. */
  titolo: string
  /** A chi era stato indirizzato. Null se non era noto nemmeno allora. */
  destinatario: string | null
  /** Data di invio, in formato italiano. */
  inviatoIl: string
  /** Data in cui il termine è scaduto, in formato italiano. */
  scadutoIl: string
  /** Giorni del termine di legge. */
  giorniTermine: number
  /** La norma da cui viene il termine, in chiaro. */
  baseTermine: string
  /** Giorni interi trascorsi dalla scadenza al momento della redazione. */
  giorniDallaScadenza: number
  /**
   * Il corpo dell'atto originario, ripulito dalle sezioni di servizio
   * (segnalazioni richiamate, riferimenti, note per la revisione, disclaimer).
   *
   * Serve perché un riesame che non dice che cosa era stato chiesto è
   * inservibile per chi lo riceve: il responsabile della trasparenza non ha
   * davanti l'istanza originaria e non deve andarsela a cercare. È un testo già
   * passato dalla revisione umana — l'atto è stato inviato, quindi qualcuno lo
   * ha letto e firmato — e costruito su `anon_text`: non reintroduce nulla che
   * non fosse già uscito.
   *
   * Null quando l'atto originario non è recuperabile in forma utile.
   */
  corpo: string | null
}

export interface ContestoAtto {
  cluster: {
    titolo: string
    riassunto: string
    categoria: string
    citta: string
    quartiere: string | null
    cittadini: number
    segnalazioni: number
  }
  /** Le segnalazioni del gruppo, numerate. */
  citazioni: SegnalazioneCitabile[]
  /** Destinatario preso da pa_endpoints. Null se non lo conosciamo. */
  destinatario: string | null
  /**
   * Valorizzato solo negli atti di seguito. Gli altri quattro modelli lo
   * ignorano: un accesso civico non è il seguito di niente.
   */
  attoPrecedente?: AttoPrecedente | null
}

/**
 * Il termine entro cui la pubblica amministrazione deve rispondere all'atto.
 *
 * Sta accanto al riferimento normativo da cui deriva, e non in una tabella
 * staccata, perché è la stessa cosa: chi cambia il termine deve vedere la norma
 * che lo impone, e chi cambia la norma deve vedere il termine che ne discende.
 *
 * `null` non è una dimenticanza: significa «per questo atto non esiste un
 * termine di legge verificabile». Un termine sbagliato fa partire un sollecito
 * fuori tempo, e un sollecito fuori tempo indebolisce la posizione dei
 * cittadini davanti all'amministrazione che avrebbe ancora avuto giorni per
 * rispondere. Meglio nessun conteggio che un conteggio falso.
 */
export interface TermineDiLegge {
  /** Giorni naturali dalla presentazione dell'atto. */
  giorni: number
  /**
   * La norma da cui viene il termine, in chiaro e per esteso — «art. 5, c. 6,
   * D.Lgs. 33/2013 — 30 giorni». Finisce in `actions.deadline_basis`: un
   * termine senza fonte non è verificabile da nessuno.
   */
  base: string
}

/**
 * Riferimento normativo VERIFICATO.
 *
 * `fonte` non è decorativa: è l'URL su cui l'articolo è stato controllato.
 * Un riferimento senza fonte verificabile non entra in un atto — citare una
 * norma che non dice quello che sosteniamo è il modo più rapido di far
 * cestinare un esposto e di far passare per inaffidabili i firmatari.
 */
export interface RiferimentoNormativo {
  /** Come si cita: «art. 5, D.Lgs. 33/2013». */
  citazione: string
  /** Cosa stabilisce, in una frase. */
  contenuto: string
  /** URL ufficiale su cui è stato verificato. */
  fonte: string
}

export interface ModelloAtto {
  kind: ActionKind
  /** Ruolo del destinatario da cercare in pa_endpoints. */
  ruoloDestinatario: string
  /** Firme necessarie prima di considerare l'atto sostenuto. */
  firmeObiettivo: number
  /** Titolo dell'atto, costruito dal contesto. */
  titolo: (ctx: ContestoAtto) => string
  /** Istruzioni di sistema per il modello. */
  systemPrompt: string
  /** Il materiale su cui scrivere. */
  userPrompt: (ctx: ContestoAtto) => string
  /** Riferimenti verificati che l'atto può citare. */
  riferimenti: RiferimentoNormativo[]
  /**
   * Termine di legge per la risposta, oppure `null` se non esiste o non è
   * deducibile da un riferimento verificato.
   *
   * Il campo è obbligatorio anche quando vale `null`: chi aggiunge un modello
   * nuovo deve decidere esplicitamente se quell'atto ha un termine, invece di
   * dimenticarsene e lasciare che lo scadenzario non conti i giorni in
   * silenzio. Il termine deve derivare da uno dei `riferimenti` qui sopra.
   */
  termine: TermineDiLegge | null
}

/** Blocco che compare in ogni atto, in pagina e nel PDF. */
export const DISCLAIMER_AI =
  'Bozza redatta con l\'assistenza di un sistema automatico a partire dalle ' +
  'segnalazioni dei cittadini indicate in calce, e sottoposta a revisione umana ' +
  'prima di qualsiasi invio. I fatti riportati derivano esclusivamente da tali ' +
  'segnalazioni.'

/**
 * Regole di redazione comuni a tutti gli atti.
 *
 * Vengono anteposte al system prompt di ogni modello: sono i vincoli che, se
 * violati, rendono l'atto dannoso invece che inutile.
 */
export const REGOLE_COMUNI = `REGOLE INDEROGABILI, VALIDE PER QUALUNQUE ATTO

1. SOLO FATTI CHE TI SONO STATI DATI.
   Ogni affermazione di fatto deve poter essere ricondotta a una o più
   segnalazioni citate con il loro numero, nella forma [3] oppure [1][4][7].
   Non aggiungere circostanze, non arrotondare, non "completare" un racconto
   incompleto. Se un dato non c'è, l'atto dice che non c'è.

2. NIENTE NUMERI INVENTATI.
   Non scrivere percentuali, medie o stime che nessuno ha calcolato. Si scrive
   «N segnalazioni riferiscono attese superiori a sei ore», non «il 70% dei
   cittadini attende più di sei ore».

3. NESSUNA PERSONA FISICA NOMINATA.
   Non nominare né accusare individui, nemmeno se il nome comparisse nelle
   segnalazioni. Si indicano uffici, enti e funzioni: «l'amministrazione
   competente», «l'ufficio X». Mai «il dirigente Tal dei Tali ha omesso».
   Questo vale anche per i cittadini firmatari: nel corpo dell'atto non
   compaiono nomi.

4. SOLO I RIFERIMENTI NORMATIVI CHE TI SONO STATI FORNITI.
   Non citare articoli a memoria e non inventarne di plausibili. Se
   nell'elenco fornito non c'è la norma che ti servirebbe, scrivi l'atto senza
   e segnala la lacuna nella sezione delle note.

5. TONO SOBRIO.
   Italiano formale, asciutto, verificabile. Nessuna retorica militante,
   nessun punto esclamativo, nessuna emoji, nessun aggettivo che non aggiunga
   un fatto. La forza dell'atto sta nelle date e nei numeri.

6. È UNA BOZZA.
   Dove serve una decisione umana (destinatario esatto, protocollo, allegati,
   dati del firmatario) lascia un segnaposto esplicito fra parentesi quadre,
   per esempio [DA COMPLETARE: protocollo]. Non riempire quei campi da solo.

Produci Markdown: intestazione, corpo, e in fondo la sezione «Segnalazioni
richiamate» con l'elenco numerato delle date e dei luoghi citati.`
