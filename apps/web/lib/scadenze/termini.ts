/**
 * I termini di legge entro cui la pubblica amministrazione deve rispondere.
 *
 * PLAN2 §3.1: «Ogni atto ha un termine di legge, e il silenzio ha conseguenze
 * precise. Oggi nessuno conta quei giorni.» Questo modulo li conta, e lo fa in
 * un posto solo: chi calcola una scadenza — il pannello di amministrazione
 * quando manda un atto, il job giornaliero quando ripassa gli atti già partiti —
 * chiama sempre di qui.
 *
 * DA DOVE VENGONO I NUMERI.
 * Non da questo file. Ogni termine sta accanto al riferimento normativo da cui
 * deriva, dentro il `ModelloAtto` che lo cita: chi cambia il termine vede la
 * norma, chi cambia la norma vede il termine. Qui si fa solo la somma dei
 * giorni e si tiene l'elenco dei tipi di atto per cui un modello non esiste
 * ancora.
 *
 * PERCHÉ CI SONO DEI `null`, E PERCHÉ SONO LA PARTE IMPORTANTE.
 * Un termine sbagliato fa partire un sollecito quando l'amministrazione aveva
 * ancora giorni per rispondere. Il danno non è tecnico: è il cittadino che
 * firma un atto prematuro e si sente rispondere che il termine non era scaduto.
 * Da quel momento è lui a dover spiegare, e la sua richiesta legittima passa
 * per un'insistenza infondata. Meglio nessun conteggio che un conteggio falso:
 * dove il termine non è deducibile da una fonte verificata, questo modulo
 * restituisce `null` e lo scadenzario semplicemente non si attiva.
 */

import type { ActionKind } from '@voce/db'

import { accessoCivico } from '@/lib/ai/atti/accesso-civico'
import { dossierGiornalistico } from '@/lib/ai/atti/dossier-giornalistico'
import { espostoProcura } from '@/lib/ai/atti/esposto-procura'
import { mozioneConsigliere } from '@/lib/ai/atti/mozione-consigliere'
import { riesameAccessoCivico } from '@/lib/ai/atti/riesame-accesso-civico'
import { sollecito } from '@/lib/ai/atti/sollecito'
import type { TermineDiLegge } from '@/lib/ai/atti/tipi'
import { logger } from '@/lib/utils/logger'

// Il contratto fra agenti prevede `TermineDiLegge` esportato da qui. La forma
// è dichiarata accanto ai modelli — è lì che serve leggerla — e riesportata
// perché chi lavora sullo scadenzario non debba conoscere `lib/ai/atti`.
export type { TermineDiLegge }

/**
 * Il termine di ogni tipo di atto, incluso quello dei tipi per cui non esiste
 * ancora un modello.
 *
 * `Record<ActionKind, …>` e non `Partial`: aggiungere un valore all'enum
 * `action_kind` deve rompere la compilazione qui, non far scivolare un tipo di
 * atto fuori dallo scadenzario in silenzio.
 */
const TERMINI: Record<ActionKind, TermineDiLegge | null> = {
  // Dai modelli, accanto ai riferimenti verificati che li fondano.
  accesso_civico: accessoCivico.termine,
  riesame_accesso_civico: riesameAccessoCivico.termine,
  sollecito: sollecito.termine,
  esposto_procura: espostoProcura.termine,
  mozione_consigliere: mozioneConsigliere.termine,
  dossier_giornalistico: dossierGiornalistico.termine,

  /**
   * La diffida non ha ancora un modello in `lib/ai/atti`, ma è già nell'enum e
   * `action_follow_up_kind()` la mappa su `sollecito`: se non le si desse un
   * termine, quel ramo della catena resterebbe muto.
   *
   * Trenta giorni è il termine ordinario dell'art. 2, comma 2, della
   * L. 241/1990, verificato su Normattiva e riportato per intero fra i
   * riferimenti del modello del sollecito (`lib/ai/atti/sollecito.ts`): «nei
   * casi in cui disposizioni di legge ovvero i provvedimenti di cui ai commi 3,
   * 4 e 5 non prevedono un termine diverso… entro il termine di trenta giorni».
   *
   * È un termine RESIDUALE: il singolo procedimento può averne uno proprio, più
   * lungo, fissato con regolamento (fino a novanta giorni, e in casi eccezionali
   * fino a centottanta). La clausola sta dentro `base` e quindi finisce in
   * `actions.deadline_basis` e nel testo dell'atto di seguito, dove chi
   * revisiona la legge e la verifica prima di firmare. Non è un dettaglio
   * pignolo: è la differenza fra un sollecito fondato e un sollecito che
   * l'amministrazione può rispedire al mittente in due righe.
   */
  diffida_pa: {
    giorni: 30,
    base:
      'art. 2, comma 2, L. 241/1990 — 30 giorni dal ricevimento della domanda ' +
      '(art. 2, comma 6), salvo che per quello specifico procedimento sia ' +
      'previsto un termine diverso ai sensi dell\'art. 2, commi 3, 4 e 5',
  },

  /**
   * Nessun termine, e qui il `null` costa qualcosa: è l'ultimo anello della
   * catena, quindi nessuno conterà i giorni della risposta del difensore civico.
   *
   * Il motivo è che il termine dipende da quale strada ha portato fin qui, e il
   * solo tipo di atto non lo dice. Quando il difensore civico è adito come
   * rimedio contro il diniego di accesso civico di un'amministrazione regionale
   * o di un ente locale, l'art. 5, comma 8, del D.Lgs. 33/2013 gli assegna
   * trenta giorni. Quando invece è una segnalazione generica, la disciplina è
   * quella delle leggi regionali e degli statuti comunali che lo istituiscono:
   * cambia da ente a ente, e in molti comuni l'organo non è nemmeno costituito.
   *
   * Dedurre trenta giorni per tutti significherebbe scrivere in un atto un
   * termine che per la maggior parte dei casi non esiste. Resta `null` finché
   * non ci sarà un modello di atto che distingua i due casi e porti con sé il
   * riferimento verificato che lo fonda.
   */
  segnalazione_difensore_civico: null,
}

/**
 * IL TERMINE PER IL RICORSO AL TAR NON È QUI, E NON PUÒ ESSERCI.
 *
 * Dopo il riesame dell'art. 5, comma 7, l'unico rimedio che resta è il ricorso
 * al Tribunale amministrativo regionale: trenta giorni, art. 116, comma 1, del
 * D.Lgs. 104/2010, verificato sul testo vigente. È il termine più corto e più
 * definitivo dell'intera catena, ed è anche l'unico che questo modulo non
 * conta. La scelta è deliberata, e va letta prima di provare ad aggiungerlo.
 *
 * Primo: non è un termine della stessa specie degli altri. `TERMINI` contiene
 * i termini entro cui un'amministrazione deve rispondere a un atto che le è
 * stato mandato, e da lì lo scadenzario ricava `deadline_at` e prepara l'atto
 * di seguito. Il termine per il ricorso è un termine di decadenza che corre
 * contro il cittadino: metterlo nella stessa tabella significherebbe far
 * generare al job un «seguito» che nessun modello sa scrivere e che non è un
 * atto amministrativo ma un ricorso giurisdizionale, per il quale serve un
 * difensore.
 *
 * Secondo, e decisivo: non se ne conosce il giorno iniziale. L'art. 116, comma
 * 1, lo fa decorrere «dalla conoscenza della determinazione impugnata o dalla
 * formazione del silenzio», e l'art. 5, comma 8, del D.Lgs. 33/2013 lo fa
 * decorrere, per chi si è rivolto al difensore civico, «dalla data di
 * ricevimento, da parte del richiedente, dell'esito della sua istanza». VOCE
 * non registra nessuno di questi fatti. `actions.submitted_at` è la data in cui
 * un amministratore dichiara di aver mandato l'atto, e `action_responses
 * .received_at` è la data in cui qualcuno ha caricato una risposta nel
 * pannello: nessuna delle due è la data in cui il richiedente ha avuto legale
 * conoscenza dell'atto che vorrebbe impugnare.
 *
 * Terzo: è un termine processuale, e i termini processuali «sono sospesi dal 1°
 * agosto al 31 agosto di ciascun anno» (art. 54, comma 2, del D.Lgs. 104/2010,
 * verificato). L'aritmetica di `calcolaScadenza` somma giorni di calendario e
 * lo dichiara apertamente: è un promemoria, non un calcolo processuale. Per
 * ogni decorrenza fra luglio e agosto darebbe una data anticipata di un mese.
 *
 * Un termine sbagliato qui non fa perdere una risposta: fa perdere l'unica
 * strada rimasta. Quindi non lo si calcola. Il cittadino ne viene avvisato
 * altrove, per via testuale e senza date: nel rimedio `ricorso_tar_accesso` di
 * `lib/ai/risposte.ts`, che dice espressamente che il servizio non conta quei
 * giorni, e nelle note per la revisione del modello
 * `lib/ai/atti/riesame-accesso-civico.ts`, dove chi rivede la bozza legge che
 * il termine esiste, da che cosa decorre e che va verificato con un legale.
 *
 * Perché possa essere contato servono due cose, in quest'ordine: una colonna
 * che registri la data in cui il richiedente ha avuto conoscenza dell'atto, e
 * un conteggio che modelli la sospensione feriale. Finché mancano, resta
 * scritto qui perché non c'è.
 */

/**
 * Il termine di legge per un tipo di atto, oppure `null` se non ne ha uno
 * verificabile.
 *
 * Firma condivisa fra agenti: non cambiarla senza avvisare chi la usa.
 */
export function termineDiLegge(kind: ActionKind): TermineDiLegge | null {
  return TERMINI[kind] ?? null
}

/** Il risultato del calcolo, nella forma con cui si scrive su `actions`. */
export interface ScadenzaCalcolata {
  /** Istante di scadenza, ISO 8601. Va in `actions.deadline_at`. */
  deadlineAt: string
  /** Giorni del termine. Va in `actions.deadline_days`. */
  deadlineDays: number
  /** La norma, in chiaro. Va in `actions.deadline_basis`. */
  deadlineBasis: string
}

const MS_IN_UN_GIORNO = 24 * 60 * 60 * 1000

/**
 * Quando scade il termine di un atto inviato.
 *
 * La chiama il pannello di amministrazione nel momento in cui una persona porta
 * l'atto a `inviata` e valorizza `submitted_at`; la richiama il job giornaliero
 * per gli atti già partiti che ne sono sprovvisti. `null` significa «questo
 * atto non ha un termine»: chi la chiama scrive `deadline_at` a null e lo
 * scadenzario lo ignora per sempre.
 *
 * COME SI CONTA, E PERCHÉ SI ARROTONDA PER ECCESSO.
 * La scadenza cade alla fine dell'ultimo giorno del termine, non nello stesso
 * minuto in cui l'atto è partito. È il modo di contare dell'art. 2963 del
 * codice civile — il giorno iniziale non si computa, il termine scade con lo
 * spirare dell'ultimo giorno — ed è anche quello prudente: fra le due
 * approssimazioni possibili si sceglie sempre quella che fa aspettare un giorno
 * di più.
 *
 * NON sono modellati i giorni festivi, che possono spostare in avanti la
 * scadenza. È una semplificazione dichiarata, e regge per una ragione precisa:
 * l'atto di seguito non parte alla scadenza, ma almeno un giorno dopo
 * (`SCADENZA_GIORNI_SEGUITO`) e comunque nasce `bozza`, cioè passa da una
 * persona che ha il termine e la sua fonte scritti davanti in
 * `deadline_basis`. Il conteggio è un promemoria, non un calcolo processuale.
 */
export function calcolaScadenza(
  kind: ActionKind,
  submittedAt: string | Date,
): ScadenzaCalcolata | null {
  const termine = termineDiLegge(kind)
  if (!termine) return null

  const inizio = submittedAt instanceof Date ? submittedAt : new Date(submittedAt)
  if (Number.isNaN(inizio.getTime())) {
    // Nessun catch silenzioso: una data di invio illeggibile è un dato rotto in
    // tabella, e senza log resterebbe un atto che non scade mai.
    logger.error('scadenze.data_invio_illeggibile', {
      kind,
      submitted_at: String(submittedAt),
    })
    return null
  }

  const scadenza = new Date(inizio.getTime() + termine.giorni * MS_IN_UN_GIORNO)
  scadenza.setUTCHours(23, 59, 59, 999)

  return {
    deadlineAt: scadenza.toISOString(),
    deadlineDays: termine.giorni,
    deadlineBasis: termine.base,
  }
}

/**
 * L'istante del primo avviso, a metà termine.
 *
 * A metà strada c'è ancora tempo per sollecitare l'ufficio con una telefonata o
 * per accorgersi che la ricevuta di invio non è mai arrivata; alla scadenza non
 * più. Si calcola sulla distanza reale fra invio e scadenza, non su
 * `deadline_days`, così resta corretto anche per un atto la cui scadenza sia
 * stata corretta a mano da una persona.
 */
export function istanteMetaTermine(
  submittedAt: string | Date,
  deadlineAt: string | Date,
  frazione: number,
): Date | null {
  const inizio = submittedAt instanceof Date ? submittedAt : new Date(submittedAt)
  const fine = deadlineAt instanceof Date ? deadlineAt : new Date(deadlineAt)

  if (Number.isNaN(inizio.getTime()) || Number.isNaN(fine.getTime())) return null
  if (fine.getTime() <= inizio.getTime()) return null

  return new Date(inizio.getTime() + (fine.getTime() - inizio.getTime()) * frazione)
}

/**
 * Giorni interi trascorsi fra due istanti, mai negativi.
 * Finisce dentro un atto («sono trascorsi N giorni dalla scadenza»), quindi si
 * tronca invece di arrotondare: dichiarare un giorno in più di quelli passati è
 * un'inesattezza che l'amministrazione può correggere in una riga.
 */
export function giorniInteriTra(da: string | Date, a: string | Date): number {
  const inizio = da instanceof Date ? da : new Date(da)
  const fine = a instanceof Date ? a : new Date(a)

  if (Number.isNaN(inizio.getTime()) || Number.isNaN(fine.getTime())) return 0

  const differenza = fine.getTime() - inizio.getTime()
  if (differenza <= 0) return 0

  return Math.floor(differenza / MS_IN_UN_GIORNO)
}
