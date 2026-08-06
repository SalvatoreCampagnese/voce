import { CalloutAvviso } from '@voce/ui'

/**
 * Esito dell'ultima azione, letto dalla query string.
 *
 * Perché non `useActionState`: quello richiede un componente client, e il
 * pannello deve funzionare con JavaScript spento. Le Server Action qui dentro
 * finiscono con un `redirect('/admin/...?esito=x')`, e questa componente
 * traduce il codice in una frase. Senza JavaScript il risultato si vede
 * comunque, perché è il server ad aver già ricaricato la pagina.
 *
 * I codici sono stringhe corte e stabili: compaiono nell'URL, quindi non
 * possono contenere il testo di un atto né il nome di un cittadino.
 */

type Tono = 'successo' | 'attenzione' | 'errore'

interface Messaggio {
  tono: Tono
  titolo: string
  testo: string
}

const ESITI: Record<string, Messaggio> = {
  pubblicato: {
    tono: 'successo',
    titolo: 'Atto revisionato',
    testo:
      'Il testo è ora pubblico. Accanto compare il tuo nome come persona che lo ha letto.',
  },
  'gia-revisionato': {
    tono: 'attenzione',
    titolo: 'Era già revisionato',
    testo:
      'Questo atto porta già la firma di chi lo ha letto. Non è stato cambiato niente.',
  },
  'testo-corretto': {
    tono: 'successo',
    titolo: 'Testo aggiornato',
    testo: 'La correzione è salvata. Rileggi il testo prima di procedere.',
  },
  'firme-aperte': {
    tono: 'successo',
    titolo: 'Raccolta firme aperta',
    testo: 'I cittadini possono firmare l’atto. Non è ancora partito.',
  },
  inviato: {
    tono: 'successo',
    titolo: 'Atto segnato come inviato',
    testo: 'Il termine di legge è partito. Trovi la scadenza qui sotto.',
  },
  'inviato-senza-termine': {
    tono: 'attenzione',
    titolo: 'Atto inviato, nessun termine di legge',
    testo:
      'Per questo tipo di atto la legge non fissa un termine di risposta. Nessuna scadenza da contare.',
  },
  archiviato: {
    tono: 'successo',
    titolo: 'Atto archiviato',
    testo: 'Resta consultabile, ma esce dalla coda di lavoro.',
  },
  'risposta-salvata': {
    tono: 'successo',
    titolo: 'Risposta salvata',
    testo:
      'Il modello ha proposto una classificazione. Controllala: diventa pubblica solo se la confermi.',
  },
  'risposta-salvata-senza-lettura': {
    tono: 'attenzione',
    titolo: 'Risposta salvata, lettura non riuscita',
    testo:
      'Il testo è al sicuro. La lettura automatica non è partita: scegli tu la classificazione.',
  },
  'classificazione-corretta': {
    tono: 'successo',
    titolo: 'Classificazione aggiornata',
    testo: 'Resta privata finché non la confermi.',
  },
  'risposta-confermata': {
    tono: 'successo',
    titolo: 'Risposta confermata',
    testo: 'Da adesso entra nel quadro pubblico, con il tuo nome come garanzia.',
  },
  'flag-tolto': {
    tono: 'successo',
    titolo: 'Revisione chiusa',
    testo: 'Il gruppo può di nuovo generare atti.',
  },
  'sospetto-confermato': {
    tono: 'successo',
    titolo: 'Sospetto confermato',
    testo: 'Il gruppo resta fermo sugli atti e resta visibile al pubblico.',
  },
}

const ERRORI: Record<string, Messaggio> = {
  'revisione-mancante': {
    tono: 'errore',
    titolo: 'Prima serve la revisione',
    testo:
      'Un atto non parte senza il nome di chi lo ha letto. Revisiona il testo, poi segna l’invio.',
  },
  'stato-non-valido': {
    tono: 'errore',
    titolo: 'Passaggio non consentito',
    testo: 'L’atto non è nello stato giusto per questa operazione. Ricarica la pagina.',
  },
  'permesso-negato': {
    tono: 'errore',
    titolo: 'Modifica rifiutata dal database',
    testo:
      'Dal pannello si possono cambiare solo i campi di revisione. Segnalalo a chi gestisce il sistema.',
  },
  'gruppo-in-revisione': {
    tono: 'errore',
    titolo: 'Gruppo in revisione',
    testo:
      'Finché il gruppo è sotto revisione non nascono atti. Chiudi prima la revisione del gruppo.',
  },
  'classificazione-mancante': {
    tono: 'errore',
    titolo: 'Manca la classificazione',
    testo: 'Scegli come è andata la risposta prima di confermarla.',
  },
  'dati-non-validi': {
    tono: 'errore',
    titolo: 'Dati non validi',
    testo: 'Controlla i campi e riprova.',
  },
  'testo-troppo-corto': {
    tono: 'errore',
    titolo: 'Testo troppo corto',
    testo: 'Incolla la risposta per intero: servono almeno trenta caratteri.',
  },
  'non-trovato': {
    tono: 'errore',
    titolo: 'Non trovato',
    testo: 'L’elemento non esiste più oppure non è visibile da questo pannello.',
  },
  errore: {
    tono: 'errore',
    titolo: 'Salvataggio non riuscito',
    testo: 'Non siamo riusciti a salvare. Riprova fra qualche minuto.',
  },
}

function primo(valore: string | string[] | undefined): string | undefined {
  return Array.isArray(valore) ? valore[0] : valore
}

/**
 * Lettura sicura dal dizionario.
 *
 * `ERRORI[codice]` con `codice` preso dall'URL non è innocuo: con
 * `?errore=constructor` si ottiene una funzione ereditata dal prototipo, e la
 * pagina esplode al primo accesso a `.tono`. `Object.hasOwn` limita la ricerca
 * alle chiavi che abbiamo scritto noi.
 */
function cerca(
  dizionario: Record<string, Messaggio>,
  codice: string | undefined,
): Messaggio | undefined {
  if (!codice) return undefined
  return Object.hasOwn(dizionario, codice) ? dizionario[codice] : undefined
}

export function EsitoAzione({
  esito,
  errore,
}: {
  esito?: string | string[]
  errore?: string | string[]
}) {
  const codiceErrore = primo(errore)
  const codiceEsito = primo(esito)

  // L'errore vince: se per qualche ragione arrivano entrambi, la cosa che
  // conta è quella che non è andata a buon fine.
  const messaggio = codiceErrore
    ? (cerca(ERRORI, codiceErrore) ?? ERRORI.errore)
    : cerca(ESITI, codiceEsito)

  if (!messaggio) return null

  return (
    <CalloutAvviso tono={messaggio.tono} titolo={messaggio.titolo} className="mb-6">
      {messaggio.testo}
    </CalloutAvviso>
  )
}
