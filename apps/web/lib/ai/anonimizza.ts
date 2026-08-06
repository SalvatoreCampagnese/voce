import { zodResponseFormat } from 'openai/helpers/zod'

import { MODEL_ANONIMIZZA, getOpenAI, stimaCostoEuro } from '@/lib/ai/openai'
import {
  ANONIMIZZA_SYSTEM_PROMPT,
  RevisioneAnonimatoSchema,
  type RevisioneAnonimatoOutput,
} from '@/lib/ai/prompts'
import { logAiUsage, logger, serializeError } from '@/lib/utils/logger'

/**
 * Anonimizzazione a due livelli (PLAN2 §5.1).
 *
 * Oggi `anon_text` esce dallo stesso modello che fa il triage, nella stessa
 * chiamata in cui decide categoria, urgenza e comune. Da lì va su una pagina
 * pubblica e indicizzabile e dentro gli atti: un civico, un cognome o il nome
 * di una scuola che sopravvivono a quella singola passata sono online, e
 * l'errore non si accorge di essere un errore.
 *
 * Qui si aggiungono due reti, in quest'ordine:
 *
 *   1. regole deterministiche — le espressioni regolari non hanno fantasia, ed
 *      è esattamente il pregio che serve: quello che catturano lo catturano
 *      sempre, anche il giorno in cui il modello ha una giornata storta;
 *   2. un secondo passaggio con un modello dedicato, con il solo compito di
 *      cercare ciò che è sopravvissuto (nomi, ruoli unici, dettagli che
 *      individuano una persona sola).
 *
 * Nessuna delle due basta da sola. Le regole non riconoscono «il custode della
 * scuola Manzoni»; il modello dimentica un numero di telefono una volta ogni
 * tanto, ed è quella volta che conta.
 */
export interface EsitoAnonimizzazione {
  testo: string
  /**
   * Una voce per ogni elemento rimosso, nella forma `regola:<nome>` o
   * `modello:<categoria>`. Il prefisso dice QUALE dei due livelli ha catturato:
   * è la misura di quanto il primo modello sbaglia da solo, cioè il dato che
   * serve a decidere se la seconda rete vale il suo costo.
   *
   * Mai il valore rimosso: registrare che si è oscurato «via Ferrari 3»
   * scrivendo «via Ferrari 3» in un log non è anonimizzare, è spostare.
   */
  modifiche: string[]
  /** true se il secondo passaggio ha trovato qualcosa che il primo aveva lasciato */
  correzioni: boolean
  /**
   * true se il secondo passaggio è girato davvero (a prescindere dall'esito).
   *
   * Estensione additiva rispetto al contratto condiviso: serve a popolare
   * `reports.anon_reviewed_at` solo quando la rete è passata sul serio. Con i
   * soli tre campi del contratto, un fallimento della chiamata e un testo già
   * pulito sarebbero indistinguibili — e la colonna che dovrebbe dimostrare che
   * il controllo c'è stato direbbe una cosa non vera.
   */
  revisionato: boolean
}

/**
 * Categoria di una modifica, con quante volte è scattata.
 *
 * È un type e non un'interface di proposito: finisce in una colonna `jsonb`, e
 * solo un type alias è assegnabile al tipo `Json` generato da Supabase.
 */
export type ModificaAggregata = {
  regola: string
  conteggio: number
}

// ---------------------------------------------------------------------------
// 1. Regole deterministiche
//
// L'ORDINE NON È CASUALE e non va cambiato senza rileggere questo commento:
// email e IBAN contengono lunghe sequenze di cifre che la regola sui telefoni
// spezzerebbe a metà, lasciando in pagina il resto del dato. Si tolgono prima i
// pattern lunghi e specifici, poi quelli corti e generici. I segnaposto che
// sostituiscono i valori non contengono cifre, quindi non possono essere
// ri-catturati dalle regole successive.
// ---------------------------------------------------------------------------

interface RegolaDeterministica {
  nome: string
  pattern: RegExp
  /** Riceve il match e i gruppi di cattura, restituisce ciò che resta in pagina. */
  sostituisci: (match: string, gruppi: string[]) => string
}

/**
 * Parole che dopo un numero lo rendono una durata, una quantità o un piano —
 * non un numero civico. «via Ferrari 3 anni fa» deve restare intatto: togliere
 * quel 3 non anonimizza nessuno, cambia i fatti raccontati dal cittadino.
 */
const UNITA_DOPO_NUMERO =
  '(?:anni|anno|mesi|mese|settimane|settimana|giorni|giorno|ore|ora|minuti|minuto|volte|volta|euro|metri|metro|km|chilometri|persone|bambini|piano|piani|gradi|%)'

const REGOLE: RegolaDeterministica[] = [
  {
    // Indirizzi email. Cattura le forme normali (anche con punti, più e
    // trattini) e i domini con lettere accentate. NON cattura le email
    // scritte a parole («mario punto rossi chiocciola gmail»): quelle
    // restano al secondo passaggio.
    nome: 'email',
    pattern: /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/giu,
    sostituisci: () => '[contatto omesso]',
  },
  {
    // IBAN italiano: IT + 2 cifre di controllo + CIN + 5 ABI + 5 CAB + 12
    // caratteri di conto, con o senza spazi di gruppo. NON cattura gli IBAN
    // esteri (DE, FR…): sono rarissimi in una segnalazione civica e un pattern
    // generico su 15-34 caratteri alfanumerici falcerebbe parole normali.
    // Gli spazi si consumano PRIMA di ogni carattere e mai dopo l'ultimo:
    // divorare lo spazio finale attaccava il segnaposto alla parola seguente.
    nome: 'iban',
    pattern: /\bIT\s?\d{2}\s?[A-Za-z](?:\s?\d){10}(?:\s?[A-Za-z0-9]){12}\b/g,
    sostituisci: () => '[coordinate bancarie omesse]',
  },
  {
    // Codice fiscale nella forma canonica: 6 lettere, 2 cifre, 1 lettera di
    // mese (fra le 12 ammesse), 2 cifre, 1 lettera + 3 cifre di comune, 1
    // lettera di controllo. NON cattura i codici con omocodia (cifre
    // sostituite da lettere): sono un caso raro e un pattern più largo
    // inizierebbe a mangiare parole comuni.
    nome: 'codice_fiscale',
    pattern: /\b[A-Za-z]{6}\d{2}[ABCDEHLMPRSTabcdehlmprst]\d{2}[A-Za-z]\d{3}[A-Za-z]\b/g,
    sostituisci: () => '[codice fiscale omesso]',
  },
  {
    // Numeri di telefono italiani: cellulari (3xx), fissi con prefisso (0xx),
    // con o senza +39 e con spazi, punti, trattini o barre come separatori.
    // Il pattern è volutamente largo e la selezione vera la fa il conteggio
    // delle cifre in `sostituisci`: senza quel controllo una data (01/02/2024)
    // o un importo diventerebbero un telefono.
    // NON cattura: numeri brevi di pubblica utilità (112, 118, 1500), che
    // devono restare leggibili perché fanno parte del racconto.
    nome: 'telefono',
    pattern: /(?:\+39[\s.-]?)?\b[03]\d(?:[\s.\-/]?\d){6,10}\b/g,
    sostituisci: (match) => {
      const cifre = match.replace(/\D/g, '').replace(/^39/, '')
      // Un numero italiano ha da 9 a 11 cifre. Fuori da quella finestra è
      // quasi sempre una data, un importo o un numero di pratica: si lascia.
      return cifre.length >= 9 && cifre.length <= 11 ? '[contatto omesso]' : match
    },
  },
  {
    // Targhe italiane in formato corrente, scritte in maiuscolo con o senza
    // separatore: «AB 123 CD», «AB-123-CD».
    // Il maiuscolo è obbligatorio di proposito: la versione insensibile alle
    // maiuscole trasformerebbe «in 123 di» in una targa e mangerebbe pezzi di
    // frase. NON cattura il vecchio formato provinciale (MI 123456) né le
    // targhe dei motocicli (AB 12345), che confliggono con i CAP.
    nome: 'targa',
    pattern: /\b[A-Z]{2}[\s-]?\d{3}[\s-]?[A-Z]{2}\b/g,
    sostituisci: () => '[targa omessa]',
  },
  {
    // La stessa targa scritta tutta attaccata («ab123cd»): sette caratteri in
    // quella sequenza non sono una parola italiana, quindi qui il maiuscolo
    // non serve.
    nome: 'targa',
    pattern: /\b[A-Za-z]{2}\d{3}[A-Za-z]{2}\b/g,
    sostituisci: () => '[targa omessa]',
  },
  {
    // Numero civico dopo un odonimo: «via Roma 15» → «via Roma».
    // La via RESTA, ed è la scelta importante: è ciò che permette a un
    // cittadino di ritrovarsi con i suoi vicini. Sparisce solo il numero, che
    // è ciò che porta a una porta.
    // NON cattura: gli indirizzi senza parola di odonimo («al 15 di Roma») e i
    // civici scritti a parole. Il lookahead protegge durate e quantità.
    nome: 'civico',
    pattern: new RegExp(
      '\\b((?:via|viale|v\\.le|piazza|p\\.zza|piazzale|corso|c\\.so|largo|vicolo|strada|contrada|lungomare|salita|traversa|borgo)' +
        "\\s+[A-Za-zÀ-ÿ'’.\\-]+(?:\\s+[A-Za-zÀ-ÿ'’.\\-]+){0,3})" +
        '(?:,\\s*|\\s+)(?:n\\.?\\s*|nr\\.?\\s*|civico\\s+)?' +
        '\\d{1,4}(?:\\s*[\\/-]\\s*[A-Za-z])?' +
        `(?!\\s*${UNITA_DOPO_NUMERO})\\b`,
      'gi',
    ),
    sostituisci: (_match, gruppi) => gruppi[0] ?? '',
  },
  {
    // Il civico annunciato dalla parola stessa: «al civico 12» → «al civico».
    // Volutamente limitato a «civico»: estenderlo a «n.» produceva frasi
    // monche del tipo «al n.» ogni volta che il numero non era un indirizzo.
    nome: 'civico',
    pattern: /\b(civico)\s+\d{1,4}(?:\s*[/-]\s*[A-Za-z])?\b/gi,
    sostituisci: (_match, gruppi) => gruppi[0] ?? 'civico',
  },
]

/**
 * Applica le regole deterministiche e annota che cosa ha tolto.
 *
 * Esportata perché è utile anche fuori dal triage — per esempio su una risposta
 * della PA da anonimizzare — e perché è testabile da sola, senza rete.
 */
export function applicaRegoleDeterministiche(testo: string): {
  testo: string
  modifiche: string[]
} {
  const modifiche: string[] = []
  let risultato = testo

  for (const regola of REGOLE) {
    risultato = risultato.replace(regola.pattern, (...argomenti) => {
      const match = String(argomenti[0])
      // Gli ultimi due argomenti di una callback di replace sono l'offset e la
      // stringa intera: i gruppi di cattura stanno in mezzo.
      const gruppi = argomenti.slice(1, -2).map((g) => (g == null ? '' : String(g)))
      const sostituto = regola.sostituisci(match, gruppi)
      // La regola può decidere di non intervenire (il telefono che si rivela
      // una data): in quel caso non è una modifica e non va contata.
      if (sostituto === match) return match
      modifiche.push(`regola:${regola.nome}`)
      return sostituto
    })
  }

  // Le sostituzioni lasciano doppi spazi e spazi prima della punteggiatura:
  // una pagina pubblica che si vede «via Roma , qui» sembra rotta, e un testo
  // che sembra rotto sembra anche poco affidabile.
  risultato = risultato
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim()

  return { testo: risultato, modifiche }
}

/**
 * Aggrega l'elenco delle modifiche in categorie con il conteggio.
 *
 * È la forma che finisce in `reports.anon_redactions`, cioè quella che permette
 * di tarare le regole deterministiche sui casi veri invece che a intuito.
 */
export function riassumiModifiche(modifiche: string[]): ModificaAggregata[] {
  const conteggi = new Map<string, number>()
  for (const voce of modifiche) {
    conteggi.set(voce, (conteggi.get(voce) ?? 0) + 1)
  }
  return [...conteggi.entries()].map(([regola, conteggio]) => ({ regola, conteggio }))
}

/**
 * Anonimizza un testo destinato a una pagina pubblica o a un atto.
 *
 * Non lancia mai. Se il secondo passaggio fallisce restituisce il testo passato
 * dalle sole regole deterministiche: un testo con una rete sola è un rischio,
 * un testo senza nessuna rete è un danno certo. Quello che non succede in
 * nessun caso è restituire il testo così com'era arrivato.
 */
export async function anonimizzaTesto(
  testo: string,
  reportId?: string,
): Promise<EsitoAnonimizzazione> {
  const partenza = testo.trim()
  if (!partenza) {
    return { testo: '', modifiche: [], correzioni: false, revisionato: false }
  }

  const deterministico = applicaRegoleDeterministiche(partenza)

  try {
    const completamento = await getOpenAI().chat.completions.parse({
      model: MODEL_ANONIMIZZA,
      messages: [
        { role: 'system', content: ANONIMIZZA_SYSTEM_PROMPT },
        { role: 'user', content: deterministico.testo },
      ],
      response_format: zodResponseFormat(RevisioneAnonimatoSchema, 'anonimato'),
      temperature: 0,
    })

    logAiUsage({
      model: MODEL_ANONIMIZZA,
      operation: 'anonimizzazione',
      input_tokens: completamento.usage?.prompt_tokens ?? 0,
      output_tokens: completamento.usage?.completion_tokens ?? 0,
      cost_eur: stimaCostoEuro(
        MODEL_ANONIMIZZA,
        completamento.usage?.prompt_tokens ?? 0,
        completamento.usage?.completion_tokens ?? 0,
      ),
      report_id: reportId,
    })

    const revisione = completamento.choices[0]?.message.parsed as RevisioneAnonimatoOutput | null
    const ripulito = revisione?.testo?.trim() ?? ''

    // Due guardie sul ritorno del modello, entrambe con lo stesso principio: in
    // caso di dubbio vince il testo che ha già passato le regole.
    //  · vuoto → il modello ha cancellato la segnalazione invece di ripulirla;
    //  · molto più lungo dell'originale → ha aggiunto qualcosa di suo, e un
    //    testo pubblico che contiene frasi che il cittadino non ha scritto è
    //    peggio di un testo con un cognome di troppo.
    const troppoLungo = ripulito.length > deterministico.testo.length * 1.5 + 40
    if (!revisione || !ripulito || troppoLungo) {
      logger.warn('anonimizza.secondo_passaggio_scartato', {
        report_id: reportId,
        motivo: !revisione ? 'nessuna_estrazione' : !ripulito ? 'testo_vuoto' : 'testo_allungato',
      })
      return {
        testo: deterministico.testo,
        modifiche: deterministico.modifiche,
        correzioni: false,
        revisionato: false,
      }
    }

    const modificheModello = revisione.modifiche.map((categoria) => `modello:${categoria}`)
    const correzioni = modificheModello.length > 0 || ripulito !== deterministico.testo

    if (correzioni) {
      // Questo è il log che serve a decidere se la seconda rete vale il suo
      // costo: dice quante volte il primo modello, da solo, avrebbe pubblicato
      // qualcosa di identificante.
      logger.warn('anonimizza.correzioni_del_secondo_passaggio', {
        report_id: reportId,
        categorie: revisione.modifiche,
      })
    }

    return {
      testo: ripulito,
      modifiche: [...deterministico.modifiche, ...modificheModello],
      correzioni,
      revisionato: true,
    }
  } catch (errore) {
    logger.warn('anonimizza.secondo_passaggio_fallito', {
      report_id: reportId,
      error: serializeError(errore),
    })
    return {
      testo: deterministico.testo,
      modifiche: deterministico.modifiche,
      correzioni: false,
      revisionato: false,
    }
  }
}
