import { serverEnv } from '@/lib/config/env'
import { logger } from '@/lib/utils/logger'
import { LINGUA_PREDEFINITA, LINGUE_RISPOSTA } from '@/lib/config/constants'

const API = 'https://api.telegram.org'

/**
 * Invia un messaggio a un cittadino su Telegram.
 *
 * Non lancia: se Telegram è irraggiungibile la segnalazione è già salvata, e
 * far fallire il webhook provocherebbe un rinvio dello stesso update — cioè una
 * seconda segnalazione identica al posto di un messaggio non consegnato.
 *
 * Restituisce però se la consegna è riuscita: chi spedisce una coda di notifiche
 * ha bisogno di distinguere «consegnato» da «il cittadino ha bloccato il bot»,
 * altrimenti conta come mantenuta una promessa che nessuno ha ricevuto.
 * Nel webhook il valore si ignora; nella coda si guarda.
 */
export async function inviaMessaggioTelegram(chatId: number, testo: string): Promise<boolean> {
  try {
    const risposta = await fetch(`${API}/bot${serverEnv.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: testo,
        link_preview_options: { is_disabled: true },
      }),
    })

    if (!risposta.ok) {
      logger.warn('telegram.invio_fallito', {
        chat_id: chatId,
        status: risposta.status,
        corpo: (await risposta.text()).slice(0, 300),
      })
      return false
    }

    return true
  } catch (errore) {
    logger.warn('telegram.invio_eccezione', {
      chat_id: chatId,
      messaggio: errore instanceof Error ? errore.message : String(errore),
    })
    return false
  }
}

// ---------------------------------------------------------------------------
// Lingua della risposta (PLAN2 §2.2)
//
// Rispondere nella lingua di chi scrive è la differenza fra essere tollerati ed
// essere accolti. Le traduzioni sono SCRITTE A MANO e fisse: i messaggi di
// sistema sono sempre gli stessi, farli tradurre a un modello a ogni invio
// costerebbe soldi a ogni messaggio e potrebbe cambiare il senso di una frase
// che promette qualcosa. Una traduzione fissa è gratuita, istantanea e non
// inventa.
//
// Quello che NON si traduce: `clean_text` e `anon_text` restano sempre in
// italiano, perché il raggruppamento lavora su una lingua sola e gli atti si
// scrivono a una Procura.
// ---------------------------------------------------------------------------

/**
 * Riduce un codice lingua (`it-IT`, `en_US`, `zh-Hans`, `pt-BR`) a una delle
 * lingue in cui sappiamo rispondere. Ripiega sull'italiano.
 *
 * Il ripiego non è una resa: meglio un messaggio in italiano, che la persona
 * può far tradurre, che un messaggio tradotto male da noi.
 */
export function normalizzaLingua(codice: string | null | undefined): string {
  if (!codice) return LINGUA_PREDEFINITA
  const base = codice.trim().toLowerCase().split(/[-_]/)[0]
  if (!base) return LINGUA_PREDEFINITA
  return (LINGUE_RISPOSTA as readonly string[]).includes(base) ? base : LINGUA_PREDEFINITA
}

/**
 * Tutti i messaggi che il bot può mandare, come funzioni.
 *
 * Sono funzioni anche quando non hanno parametri: così `messaggio()` le tratta
 * tutte allo stesso modo e aggiungere un parametro a un messaggio non obbliga a
 * cambiare tutti i frasari.
 *
 * Regole di scrittura (Designers Italia): dai del tu, frasi sotto le 15 parole,
 * zero anglicismi, nessuna emoji, nessuna promessa che il sistema non può
 * mantenere. In particolare NON si scrive «lo mandiamo al Comune»: non è vero
 * finché un gruppo non raggiunge la soglia e una persona non revisiona l'atto.
 */
interface Frasario {
  /** /start, /aiuto e primo messaggio di chi non abbiamo mai visto. */
  benvenuto: () => string
  ricevuta: (url: string) => string
  ricevutaVocale: (anteprima: string, url: string) => string
  ricevutaFoto: (url: string) => string
  ricevutaFotoSenzaTesto: (url: string) => string
  /** Foto non leggibile dalla nostra parte, ma le parole scritte bastavano. */
  ricevutaFotoSoloTesto: (url: string) => string
  troppoBreve: () => string
  servonoDettagli: () => string
  /** La domanda specifica che manca, quando la segnalazione non basta. */
  domandaSpecifica: (domanda: string) => string
  /** La domanda specifica, quando la segnalazione è già utile così com'è. */
  dettaglioInPiu: (domanda: string) => string
  /**
   * La risposta alla domanda è finita nella segnalazione di prima, non in una
   * nuova. `anteprima` è la trascrizione, quando la risposta è arrivata a voce.
   */
  integrazioneAggiunta: (anteprima: string | null, url: string) => string
  inQuarantena: () => string
  chiediComune: () => string
  comuneRegistrato: (citta: string, quartiere: string | null) => string
  comuneUnitoAGruppo: (citta: string) => string
  comuneNonCapito: () => string
  troppeSegnalazioni: (minuti: number) => string
  ascoltoVocale: () => string
  guardoFoto: () => string
  /** L'audio non contiene parlato utilizzabile: si chiede di ripetere. */
  vocaleNonCapito: () => string
  /**
   * Il servizio di trascrizione non ha risposto. Il guasto è nostro e va detto
   * così: chi ha parlato non ha sbagliato niente.
   */
  vocaleNonAscoltato: () => string
  vocaleTroppoLungo: () => string
  vocaleLungoAscoltato: () => string
  fotoNonCapita: () => string
  /** Non siamo riusciti a leggere la foto, e non c'erano parole a sostituirla. */
  fotoNonLetta: () => string
  fileTroppoGrande: () => string
  posizioneRicevuta: () => string
  formatoNonSupportato: () => string
  errore: () => string
}

export type ChiaveMessaggio = keyof Frasario

/** Esempio di segnalazione fatta bene: cosa succede, dove, da quanto tempo. */
const ESEMPIO_IT =
  '«Da tre settimane il lampione di via Verdi è spento. La sera non si vede niente e ci sono già state due cadute.»'

const IT: Frasario = {
  benvenuto: () =>
    [
      'Ciao, sono VOCE.',
      '',
      'Raccontami un problema del tuo quartiere. Scrivi come parli, senza formalità.',
      '',
      'Mi servono tre cose: cosa succede, dove, e da quanto tempo.',
      '',
      `Per esempio: ${ESEMPIO_IT}`,
      '',
      'Puoi mandarmi anche un messaggio vocale o una foto: vanno bene lo stesso.',
      '',
      'Confronto quello che ricevo con le segnalazioni di altri cittadini della tua zona.',
      'Se il problema è lo stesso, insieme diventate un gruppo.',
      '',
      'Scrivimi quando vuoi.',
    ].join('\n'),

  ricevuta: (url) =>
    [
      'Grazie, ho ricevuto la tua segnalazione.',
      '',
      'La sto confrontando con quelle di altri cittadini della tua zona.',
      'Ti scrivo appena diventa parte di un\'azione collettiva.',
      '',
      `Segui la tua segnalazione qui: ${url}`,
    ].join('\n'),

  // Si rimanda indietro quello che abbiamo capito: una trascrizione sbagliata
  // che nessuno vede diventa una segnalazione sbagliata dentro un atto.
  ricevutaVocale: (anteprima, url) =>
    [
      'Ho ascoltato il tuo vocale. Ho capito questo:',
      '',
      `«${anteprima}»`,
      '',
      'Se ho capito male, rimandamelo pure a voce o scrivimelo.',
      '',
      'Lo sto confrontando con le segnalazioni di altri cittadini della tua zona.',
      '',
      `Segui la tua segnalazione qui: ${url}`,
    ].join('\n'),

  ricevutaFoto: (url) =>
    [
      'Ho ricevuto la tua foto e ho descritto quello che mostra.',
      '',
      'La foto resta privata: in pagina pubblica compare solo la descrizione.',
      '',
      'La sto confrontando con le segnalazioni di altri cittadini della tua zona.',
      '',
      `Segui la tua segnalazione qui: ${url}`,
    ].join('\n'),

  ricevutaFotoSenzaTesto: (url) =>
    [
      'Ho ricevuto la tua foto e ho descritto quello che mostra.',
      '',
      'Se puoi, scrivimi anche cosa succede e da quanto tempo va avanti.',
      'Con le tue parole la segnalazione vale molto di più.',
      '',
      'La foto resta privata: in pagina pubblica compare solo la descrizione.',
      '',
      `Segui la tua segnalazione qui: ${url}`,
    ].join('\n'),

  // Il guasto è nostro e la foto non l'abbiamo letta: dirlo evita che la
  // persona creda che stiamo lavorando anche sull'immagine.
  ricevutaFotoSoloTesto: (url) =>
    [
      'Non riesco a guardare la tua foto in questo momento.',
      '',
      'Ho letto quello che hai scritto: la tua segnalazione è salva.',
      '',
      'La sto confrontando con le segnalazioni di altri cittadini della tua zona.',
      '',
      `Segui la tua segnalazione qui: ${url}`,
    ].join('\n'),

  troppoBreve: () =>
    [
      'Ho bisogno di qualche parola in più per capire.',
      '',
      'Raccontami cosa è successo, dove, e da quanto tempo va avanti.',
    ].join('\n'),

  // Il messaggio supera il controllo di lunghezza ma non contiene abbastanza
  // per essere usato: «Guasto elettrico» sono due parole senza cosa, dove e
  // quando. Va detto, e va detto con un esempio: chiedere «più dettagli» senza
  // mostrare quali è un modo garantito per farsi rispondere «ma quali?».
  // Non lasciarlo credere che stiamo lavorando su una segnalazione archiviata:
  // il messaggio precedente gli ha appena promesso il contrario.
  servonoDettagli: () =>
    [
      'Mi serve qualche dettaglio in più: così com\'è non riesco a confrontarla con le altre.',
      '',
      'Raccontami cosa succede, dove, e da quanto tempo va avanti.',
      '',
      `Per esempio: ${ESEMPIO_IT}`,
      '',
      'Riscrivimela pure qui: la sostituisco a quella di prima.',
    ].join('\n'),

  // Una domanda sola e precisa fa rispondere; «servono più dettagli» no.
  domandaSpecifica: (domanda) =>
    [
      'Mi manca una cosa sola per poterla usare:',
      '',
      domanda,
      '',
      'Riscrivimi la segnalazione con questa informazione: la sostituisco a quella di prima.',
      '',
      `Per esempio: ${ESEMPIO_IT}`,
    ].join('\n'),

  dettaglioInPiu: (domanda) =>
    [
      'Ho tutto quello che mi serve. Una cosa la renderebbe più forte:',
      '',
      domanda,
      '',
      'Se lo sai, scrivimelo pure qui.',
    ].join('\n'),

  // Si dice esplicitamente che NON è nata una segnalazione nuova. È la cosa che
  // il cittadino teme dopo aver risposto a una domanda, ed è esattamente ciò
  // che succedeva prima: due segnalazioni dimezzate al posto di una completa.
  integrazioneAggiunta: (anteprima, url) =>
    [
      ...(anteprima
        ? ['Ho ascoltato il tuo vocale. Ho capito questo:', '', `«${anteprima}»`, '']
        : []),
      'L\'ho aggiunto alla segnalazione di prima: non ne ho aperta una nuova.',
      '',
      'La sto confrontando con quelle di altri cittadini della tua zona.',
      '',
      `Segui la tua segnalazione qui: ${url}`,
    ].join('\n'),

  // Quarantena (PLAN2 §1.3): onestà senza accusa. Non si nomina il motivo, non
  // si fa la lezione, non si dice che è stata cancellata — perché non lo è.
  //
  // Questo messaggio arriva DOPO `ricevuta`, che ha appena promesso «la sto
  // confrontando con quelle di altri cittadini». Non è più vero, quindi la
  // promessa va ritirata per prima: lasciarla in piedi farebbe aspettare una
  // persona per settimane, convinta che il suo racconto stia lavorando.
  // L'ultima riga è una promessa nuova, e questa la manteniamo: la decisione
  // dell'amministratore accoda un avviso (`moderazione_riammessa` o
  // `moderazione_confermata`, vedi app/admin/segnalazioni/azioni.ts).
  inQuarantena: () =>
    [
      'Ho ricevuto la tua segnalazione, ma per ora è ferma.',
      '',
      'Non la sto confrontando con le altre: prima la deve leggere una persona.',
      '',
      'Non è stata cancellata. Ti scrivo appena la decisione è presa.',
    ].join('\n'),

  // Si chiede il comune una volta sola, e si spiega perché: una domanda senza
  // motivo sembra burocrazia, con il motivo diventa collaborazione.
  chiediComune: () =>
    [
      'Una cosa sola e ho finito: in che comune succede?',
      '',
      'Mi serve per confrontare la tua segnalazione con quelle di chi vive vicino a te.',
      '',
      'Rispondi anche solo con il nome, per esempio: Milano',
    ].join('\n'),

  comuneRegistrato: (citta, quartiere) =>
    [
      `Perfetto, ${citta}${quartiere ? ` — zona ${quartiere}` : ''}.`,
      '',
      'Non te lo chiederò più: vale anche per le tue prossime segnalazioni.',
    ].join('\n'),

  comuneUnitoAGruppo: (citta) =>
    [
      `Perfetto, ${citta}.`,
      '',
      'La tua segnalazione si è unita ad altre della stessa zona: non sei da solo.',
    ].join('\n'),

  comuneNonCapito: () =>
    ['Non ho riconosciuto il comune.', '', 'Scrivimi solo il nome, per esempio: Milano'].join('\n'),

  troppeSegnalazioni: (minuti) =>
    [
      'Hai inviato diverse segnalazioni in poco tempo.',
      '',
      `Riprova fra circa ${minuti} minuti: così riesco a trattarle tutte per bene.`,
    ].join('\n'),

  // Chi manda un vocale aspetta in silenzio: senza questa riga crede che il bot
  // non abbia ricevuto niente e rimanda tutto da capo.
  ascoltoVocale: () => 'Sto ascoltando il tuo messaggio vocale. Dammi qualche secondo.',

  guardoFoto: () => 'Sto guardando la tua foto. Dammi qualche secondo.',

  vocaleNonCapito: () =>
    [
      'Non sono riuscito a capire il tuo vocale.',
      '',
      'Riprova in un posto meno rumoroso, oppure scrivimi cosa succede.',
    ].join('\n'),

  // Quando il guasto è nostro non si dice «non ho capito»: chi ha parlato
  // leggerebbe che la colpa è sua. E non si promette di riprovare da soli:
  // oggi nessun lavoro automatico ritrascrive un audio già archiviato.
  vocaleNonAscoltato: () =>
    [
      'Non riesco ad ascoltare il tuo vocale in questo momento.',
      '',
      'Non è colpa tua: il problema è dalla mia parte.',
      '',
      'Riprova fra qualche minuto, oppure scrivimi cosa succede.',
    ].join('\n'),

  vocaleTroppoLungo: () =>
    [
      'Il tuo vocale è troppo lungo per me.',
      '',
      'Dividilo in due messaggi più brevi: li ascolto tutti e due.',
    ].join('\n'),

  vocaleLungoAscoltato: () =>
    [
      'Il vocale era lungo, ma l\'ho ascoltato tutto.',
      '',
      'La prossima volta puoi dividerlo: per me è più facile capirti.',
    ].join('\n'),

  fotoNonCapita: () =>
    [
      'Non sono riuscito a capire cosa mostra la foto.',
      '',
      'Raccontami a parole cosa si vede e dove si trova.',
    ].join('\n'),

  fotoNonLetta: () =>
    [
      'Non riesco a guardare la tua foto in questo momento.',
      '',
      'Non è colpa tua: il problema è dalla mia parte.',
      '',
      'Raccontami a parole cosa si vede e dove si trova.',
    ].join('\n'),

  fileTroppoGrande: () =>
    [
      'Il file è troppo grande e non riesco ad aprirlo.',
      '',
      'Mandami un vocale più breve o una foto più leggera. Va bene anche scrivere.',
    ].join('\n'),

  // La posizione da sola non è una segnalazione: senza il racconto non sappiamo
  // cosa sia successo lì. Non la buttiamo via in silenzio, la trasformiamo in
  // una domanda.
  posizioneRicevuta: () =>
    [
      'Ho ricevuto la posizione, grazie.',
      '',
      'Ora raccontami cosa succede lì: bastano due righe, o un vocale.',
    ].join('\n'),

  formatoNonSupportato: () =>
    [
      'Per ora leggo testo, messaggi vocali e foto.',
      '',
      'Raccontami cosa succede a parole, oppure mandami un vocale.',
    ].join('\n'),

  errore: () =>
    [
      'Qualcosa non ha funzionato dalla mia parte.',
      '',
      'La tua segnalazione non è andata persa: riprova fra qualche minuto.',
    ].join('\n'),
}

const EN: Partial<Frasario> = {
  benvenuto: () =>
    [
      'Hello, I am VOCE.',
      '',
      'Tell me about a problem in your neighbourhood. Write the way you speak.',
      '',
      'I need three things: what happens, where, and for how long.',
      '',
      'For example: "The street lamp on via Verdi has been off for three weeks. At night you cannot see anything and two people have already fallen."',
      '',
      'You can also send me a voice message or a photo.',
      '',
      'I compare what I receive with reports from other people in your area.',
      'If the problem is the same, together you become a group.',
      '',
      'Write to me whenever you want.',
    ].join('\n'),
  ricevuta: (url) =>
    [
      'Thank you, I have received your report.',
      '',
      'I am comparing it with reports from other people in your area.',
      'I will write to you as soon as it becomes part of a collective action.',
      '',
      `Follow your report here: ${url}`,
    ].join('\n'),
  ricevutaVocale: (anteprima, url) =>
    [
      'I listened to your voice message. This is what I understood:',
      '',
      `"${anteprima}"`,
      '',
      'If I got it wrong, send it again or write it to me.',
      '',
      `Follow your report here: ${url}`,
    ].join('\n'),
  ricevutaFoto: (url) =>
    [
      'I received your photo and described what it shows.',
      '',
      'The photo stays private: only the description appears on public pages.',
      '',
      `Follow your report here: ${url}`,
    ].join('\n'),
  ricevutaFotoSenzaTesto: (url) =>
    [
      'I received your photo and described what it shows.',
      '',
      'If you can, also write what happens and for how long.',
      'Your own words make the report much stronger.',
      '',
      'The photo stays private: only the description appears on public pages.',
      '',
      `Follow your report here: ${url}`,
    ].join('\n'),
  ricevutaFotoSoloTesto: (url) =>
    [
      'I cannot look at your photo right now.',
      '',
      'I read what you wrote: your report is safe.',
      '',
      `Follow your report here: ${url}`,
    ].join('\n'),
  troppoBreve: () =>
    [
      'I need a few more words to understand.',
      '',
      'Tell me what happened, where, and for how long.',
    ].join('\n'),
  servonoDettagli: () =>
    [
      'I need a few more details: as it is, I cannot compare it with the others.',
      '',
      'Tell me what happens, where, and for how long.',
      '',
      'For example: "The street lamp on via Verdi has been off for three weeks. At night you cannot see anything and two people have already fallen."',
      '',
      'Write it again here: it replaces the previous one.',
    ].join('\n'),
  domandaSpecifica: (domanda) =>
    [
      'One thing is missing before I can use it:',
      '',
      domanda,
      '',
      'Write the report again with this information: it replaces the previous one.',
    ].join('\n'),
  dettaglioInPiu: (domanda) =>
    [
      'I have what I need. One thing would make it stronger:',
      '',
      domanda,
      '',
      'If you know it, write it here.',
    ].join('\n'),
  integrazioneAggiunta: (anteprima, url) =>
    [
      ...(anteprima
        ? ['I listened to your voice message. This is what I understood:', '', `"${anteprima}"`, '']
        : []),
      'I added it to your previous report: I did not open a new one.',
      '',
      'I am comparing it with reports from other people in your area.',
      '',
      `Follow your report here: ${url}`,
    ].join('\n'),
  inQuarantena: () =>
    [
      'I received your report, but for now it is on hold.',
      '',
      'I am not comparing it with the others: a person has to read it first.',
      '',
      'It has not been deleted. I will write to you once the decision is made.',
    ].join('\n'),
  chiediComune: () =>
    [
      'One last thing: in which municipality does this happen?',
      '',
      'I need it to compare your report with those of people living near you.',
      '',
      'Just the name is enough, for example: Milano',
    ].join('\n'),
  comuneRegistrato: (citta, quartiere) =>
    [
      `Good, ${citta}${quartiere ? ` — ${quartiere} area` : ''}.`,
      '',
      'I will not ask again: it also counts for your next reports.',
    ].join('\n'),
  comuneUnitoAGruppo: (citta) =>
    [
      `Good, ${citta}.`,
      '',
      'Your report joined others from the same area: you are not alone.',
    ].join('\n'),
  comuneNonCapito: () =>
    ['I did not recognise the municipality.', '', 'Write only the name, for example: Milano'].join(
      '\n',
    ),
  troppeSegnalazioni: (minuti) =>
    [
      'You have sent several reports in a short time.',
      '',
      `Try again in about ${minuti} minutes, so I can handle them all properly.`,
    ].join('\n'),
  ascoltoVocale: () => 'I am listening to your voice message. Give me a few seconds.',
  guardoFoto: () => 'I am looking at your photo. Give me a few seconds.',
  vocaleNonCapito: () =>
    [
      'I could not understand your voice message.',
      '',
      'Try again in a quieter place, or write to me what happens.',
    ].join('\n'),
  vocaleNonAscoltato: () =>
    [
      'I cannot listen to your voice message right now.',
      '',
      'It is not your fault: the problem is on my side.',
      '',
      'Try again in a few minutes, or write to me what happens.',
    ].join('\n'),
  vocaleTroppoLungo: () =>
    [
      'Your voice message is too long for me.',
      '',
      'Split it into two shorter messages: I will listen to both.',
    ].join('\n'),
  vocaleLungoAscoltato: () =>
    [
      'The voice message was long, but I listened to all of it.',
      '',
      'Next time you can split it: it is easier for me to understand you.',
    ].join('\n'),
  fotoNonCapita: () =>
    [
      'I could not understand what the photo shows.',
      '',
      'Tell me in words what you see and where it is.',
    ].join('\n'),
  fotoNonLetta: () =>
    [
      'I cannot look at your photo right now.',
      '',
      'It is not your fault: the problem is on my side.',
      '',
      'Tell me in words what you see and where it is.',
    ].join('\n'),
  fileTroppoGrande: () =>
    [
      'The file is too big and I cannot open it.',
      '',
      'Send a shorter voice message or a lighter photo. Writing works too.',
    ].join('\n'),
  posizioneRicevuta: () =>
    [
      'I received the location, thank you.',
      '',
      'Now tell me what happens there: two lines are enough, or a voice message.',
    ].join('\n'),
  formatoNonSupportato: () =>
    [
      'For now I read text, voice messages and photos.',
      '',
      'Tell me what happens in words, or send me a voice message.',
    ].join('\n'),
  errore: () =>
    [
      'Something went wrong on my side.',
      '',
      'Your report is not lost: try again in a few minutes.',
    ].join('\n'),
}

const FR: Partial<Frasario> = {
  benvenuto: () =>
    [
      'Bonjour, je suis VOCE.',
      '',
      'Raconte-moi un problème de ton quartier. Écris comme tu parles.',
      '',
      'Il me faut trois choses : ce qui se passe, où, et depuis quand.',
      '',
      'Par exemple : « Depuis trois semaines le lampadaire de la via Verdi est éteint. Le soir on ne voit rien et deux personnes sont déjà tombées. »',
      '',
      'Tu peux aussi m\'envoyer un message vocal ou une photo.',
      '',
      'Je compare ce que je reçois avec les signalements d\'autres habitants de ta zone.',
      'Si le problème est le même, vous devenez un groupe.',
      '',
      'Écris-moi quand tu veux.',
    ].join('\n'),
  ricevuta: (url) =>
    [
      'Merci, j\'ai bien reçu ton signalement.',
      '',
      'Je le compare avec ceux d\'autres habitants de ta zone.',
      'Je t\'écris dès qu\'il rejoint une action collective.',
      '',
      `Suis ton signalement ici : ${url}`,
    ].join('\n'),
  ricevutaVocale: (anteprima, url) =>
    [
      'J\'ai écouté ton message vocal. Voici ce que j\'ai compris :',
      '',
      `« ${anteprima} »`,
      '',
      'Si j\'ai mal compris, renvoie-le ou écris-le-moi.',
      '',
      `Suis ton signalement ici : ${url}`,
    ].join('\n'),
  ricevutaFoto: (url) =>
    [
      'J\'ai reçu ta photo et j\'ai décrit ce qu\'elle montre.',
      '',
      'La photo reste privée : seule la description apparaît en public.',
      '',
      `Suis ton signalement ici : ${url}`,
    ].join('\n'),
  ricevutaFotoSenzaTesto: (url) =>
    [
      'J\'ai reçu ta photo et j\'ai décrit ce qu\'elle montre.',
      '',
      'Si tu peux, écris aussi ce qui se passe et depuis quand.',
      '',
      'La photo reste privée : seule la description apparaît en public.',
      '',
      `Suis ton signalement ici : ${url}`,
    ].join('\n'),
  ricevutaFotoSoloTesto: (url) =>
    [
      'Je n\'arrive pas à regarder ta photo en ce moment.',
      '',
      'J\'ai lu ce que tu as écrit : ton signalement est enregistré.',
      '',
      `Suis ton signalement ici : ${url}`,
    ].join('\n'),
  troppoBreve: () =>
    [
      'J\'ai besoin de quelques mots de plus pour comprendre.',
      '',
      'Raconte-moi ce qui s\'est passé, où, et depuis quand.',
    ].join('\n'),
  servonoDettagli: () =>
    [
      'Il me manque des détails : tel quel, je ne peux pas le comparer aux autres.',
      '',
      'Raconte-moi ce qui se passe, où, et depuis quand.',
      '',
      'Par exemple : « Depuis trois semaines le lampadaire de la via Verdi est éteint. Le soir on ne voit rien. »',
      '',
      'Réécris-le ici : il remplace le précédent.',
    ].join('\n'),
  domandaSpecifica: (domanda) =>
    [
      'Il me manque une seule chose pour pouvoir l\'utiliser :',
      '',
      domanda,
      '',
      'Réécris ton signalement avec cette information : il remplace le précédent.',
    ].join('\n'),
  dettaglioInPiu: (domanda) =>
    [
      'J\'ai ce qu\'il me faut. Une chose le rendrait plus fort :',
      '',
      domanda,
      '',
      'Si tu le sais, écris-le ici.',
    ].join('\n'),
  integrazioneAggiunta: (anteprima, url) =>
    [
      ...(anteprima
        ? ['J\'ai écouté ton message vocal. Voici ce que j\'ai compris :', '', `« ${anteprima} »`, '']
        : []),
      'Je l\'ai ajouté à ton signalement précédent : je n\'en ai pas ouvert un nouveau.',
      '',
      'Je le compare avec ceux d\'autres habitants de ta zone.',
      '',
      `Suis ton signalement ici : ${url}`,
    ].join('\n'),
  inQuarantena: () =>
    [
      'J\'ai reçu ton signalement, mais pour l\'instant il est arrêté.',
      '',
      'Je ne le compare pas aux autres : une personne doit d\'abord le lire.',
      '',
      'Il n\'a pas été supprimé. Je t\'écris dès que la décision est prise.',
    ].join('\n'),
  chiediComune: () =>
    [
      'Une dernière chose : dans quelle commune cela se passe-t-il ?',
      '',
      'J\'en ai besoin pour comparer ton signalement avec ceux de tes voisins.',
      '',
      'Le nom suffit, par exemple : Milano',
    ].join('\n'),
  comuneRegistrato: (citta, quartiere) =>
    [
      `Parfait, ${citta}${quartiere ? ` — zone ${quartiere}` : ''}.`,
      '',
      'Je ne te le demanderai plus : cela vaut aussi pour tes prochains signalements.',
    ].join('\n'),
  comuneUnitoAGruppo: (citta) =>
    [
      `Parfait, ${citta}.`,
      '',
      'Ton signalement a rejoint d\'autres de la même zone : tu n\'es pas seul.',
    ].join('\n'),
  comuneNonCapito: () =>
    ['Je n\'ai pas reconnu la commune.', '', 'Écris seulement le nom, par exemple : Milano'].join(
      '\n',
    ),
  troppeSegnalazioni: (minuti) =>
    [
      'Tu as envoyé plusieurs signalements en peu de temps.',
      '',
      `Réessaie dans environ ${minuti} minutes : je pourrai tous les traiter.`,
    ].join('\n'),
  ascoltoVocale: () => 'J\'écoute ton message vocal. Donne-moi quelques secondes.',
  guardoFoto: () => 'Je regarde ta photo. Donne-moi quelques secondes.',
  vocaleNonCapito: () =>
    [
      'Je n\'ai pas réussi à comprendre ton message vocal.',
      '',
      'Réessaie dans un endroit plus calme, ou écris-moi.',
    ].join('\n'),
  vocaleNonAscoltato: () =>
    [
      'Je n\'arrive pas à écouter ton message vocal en ce moment.',
      '',
      'Ce n\'est pas ta faute : le problème vient de mon côté.',
      '',
      'Réessaie dans quelques minutes, ou écris-moi ce qui se passe.',
    ].join('\n'),
  vocaleTroppoLungo: () =>
    [
      'Ton message vocal est trop long pour moi.',
      '',
      'Coupe-le en deux messages plus courts : je les écoute tous les deux.',
    ].join('\n'),
  vocaleLungoAscoltato: () =>
    [
      'Le message était long, mais je l\'ai écouté en entier.',
      '',
      'La prochaine fois tu peux le couper en deux.',
    ].join('\n'),
  fotoNonCapita: () =>
    [
      'Je n\'ai pas compris ce que montre la photo.',
      '',
      'Raconte-moi avec des mots ce qu\'on voit et où c\'est.',
    ].join('\n'),
  fotoNonLetta: () =>
    [
      'Je n\'arrive pas à regarder ta photo en ce moment.',
      '',
      'Ce n\'est pas ta faute : le problème vient de mon côté.',
      '',
      'Raconte-moi avec des mots ce qu\'on voit et où c\'est.',
    ].join('\n'),
  fileTroppoGrande: () =>
    [
      'Le fichier est trop lourd et je ne peux pas l\'ouvrir.',
      '',
      'Envoie un vocal plus court ou une photo plus légère.',
    ].join('\n'),
  posizioneRicevuta: () =>
    [
      'J\'ai reçu la position, merci.',
      '',
      'Raconte-moi maintenant ce qui se passe là-bas : deux lignes suffisent.',
    ].join('\n'),
  formatoNonSupportato: () =>
    [
      'Pour l\'instant je lis le texte, les messages vocaux et les photos.',
      '',
      'Raconte-moi ce qui se passe, ou envoie-moi un vocal.',
    ].join('\n'),
  errore: () =>
    [
      'Quelque chose n\'a pas marché de mon côté.',
      '',
      'Ton signalement n\'est pas perdu : réessaie dans quelques minutes.',
    ].join('\n'),
}

const ES: Partial<Frasario> = {
  benvenuto: () =>
    [
      'Hola, soy VOCE.',
      '',
      'Cuéntame un problema de tu barrio. Escribe como hablas, sin formalidades.',
      '',
      'Necesito tres cosas: qué pasa, dónde y desde cuándo.',
      '',
      'Por ejemplo: «Desde hace tres semanas la farola de via Verdi está apagada. Por la noche no se ve nada y ya se han caído dos personas.»',
      '',
      'También puedes mandarme un mensaje de voz o una foto.',
      '',
      'Comparo lo que recibo con los avisos de otros vecinos de tu zona.',
      'Si el problema es el mismo, juntos formáis un grupo.',
      '',
      'Escríbeme cuando quieras.',
    ].join('\n'),
  ricevuta: (url) =>
    [
      'Gracias, he recibido tu aviso.',
      '',
      'Lo estoy comparando con los de otros vecinos de tu zona.',
      'Te escribo en cuanto forme parte de una acción colectiva.',
      '',
      `Sigue tu aviso aquí: ${url}`,
    ].join('\n'),
  ricevutaVocale: (anteprima, url) =>
    [
      'He escuchado tu mensaje de voz. Esto es lo que he entendido:',
      '',
      `«${anteprima}»`,
      '',
      'Si he entendido mal, mándamelo otra vez o escríbemelo.',
      '',
      `Sigue tu aviso aquí: ${url}`,
    ].join('\n'),
  ricevutaFoto: (url) =>
    [
      'He recibido tu foto y he descrito lo que muestra.',
      '',
      'La foto queda privada: en público solo aparece la descripción.',
      '',
      `Sigue tu aviso aquí: ${url}`,
    ].join('\n'),
  ricevutaFotoSenzaTesto: (url) =>
    [
      'He recibido tu foto y he descrito lo que muestra.',
      '',
      'Si puedes, escríbeme también qué pasa y desde cuándo.',
      '',
      'La foto queda privada: en público solo aparece la descripción.',
      '',
      `Sigue tu aviso aquí: ${url}`,
    ].join('\n'),
  ricevutaFotoSoloTesto: (url) =>
    [
      'No consigo mirar tu foto en este momento.',
      '',
      'He leído lo que has escrito: tu aviso está guardado.',
      '',
      `Sigue tu aviso aquí: ${url}`,
    ].join('\n'),
  troppoBreve: () =>
    [
      'Necesito algunas palabras más para entender.',
      '',
      'Cuéntame qué ha pasado, dónde y desde cuándo.',
    ].join('\n'),
  servonoDettagli: () =>
    [
      'Me faltan detalles: así no puedo compararlo con los demás.',
      '',
      'Cuéntame qué pasa, dónde y desde cuándo.',
      '',
      'Por ejemplo: «Desde hace tres semanas la farola de via Verdi está apagada.»',
      '',
      'Vuelve a escribírmelo aquí: sustituye al anterior.',
    ].join('\n'),
  domandaSpecifica: (domanda) =>
    [
      'Me falta una sola cosa para poder usarlo:',
      '',
      domanda,
      '',
      'Vuelve a escribirme el aviso con este dato: sustituye al anterior.',
    ].join('\n'),
  dettaglioInPiu: (domanda) =>
    [
      'Tengo lo que necesito. Una cosa lo haría más fuerte:',
      '',
      domanda,
      '',
      'Si lo sabes, escríbemelo aquí.',
    ].join('\n'),
  integrazioneAggiunta: (anteprima, url) =>
    [
      ...(anteprima
        ? ['He escuchado tu mensaje de voz. Esto es lo que he entendido:', '', `«${anteprima}»`, '']
        : []),
      'Lo he añadido a tu aviso anterior: no he abierto uno nuevo.',
      '',
      'Lo estoy comparando con los de otros vecinos de tu zona.',
      '',
      `Sigue tu aviso aquí: ${url}`,
    ].join('\n'),
  inQuarantena: () =>
    [
      'He recibido tu aviso, pero por ahora está parado.',
      '',
      'No lo estoy comparando con los demás: antes lo debe leer una persona.',
      '',
      'No se ha borrado. Te escribo en cuanto se tome la decisión.',
    ].join('\n'),
  chiediComune: () =>
    [
      'Una última cosa: ¿en qué municipio pasa?',
      '',
      'Lo necesito para comparar tu aviso con los de quien vive cerca de ti.',
      '',
      'Basta el nombre, por ejemplo: Milano',
    ].join('\n'),
  comuneRegistrato: (citta, quartiere) =>
    [
      `Perfecto, ${citta}${quartiere ? ` — zona ${quartiere}` : ''}.`,
      '',
      'No te lo volveré a preguntar: vale también para tus próximos avisos.',
    ].join('\n'),
  comuneUnitoAGruppo: (citta) =>
    [
      `Perfecto, ${citta}.`,
      '',
      'Tu aviso se ha unido a otros de la misma zona: no estás solo.',
    ].join('\n'),
  comuneNonCapito: () =>
    ['No he reconocido el municipio.', '', 'Escríbeme solo el nombre, por ejemplo: Milano'].join(
      '\n',
    ),
  troppeSegnalazioni: (minuti) =>
    [
      'Has enviado varios avisos en poco tiempo.',
      '',
      `Vuelve a intentarlo en unos ${minuti} minutos: así los atiendo todos bien.`,
    ].join('\n'),
  ascoltoVocale: () => 'Estoy escuchando tu mensaje de voz. Dame unos segundos.',
  guardoFoto: () => 'Estoy mirando tu foto. Dame unos segundos.',
  vocaleNonCapito: () =>
    [
      'No he conseguido entender tu mensaje de voz.',
      '',
      'Prueba en un sitio con menos ruido, o escríbeme qué pasa.',
    ].join('\n'),
  vocaleNonAscoltato: () =>
    [
      'No consigo escuchar tu mensaje de voz en este momento.',
      '',
      'No es culpa tuya: el problema está de mi lado.',
      '',
      'Inténtalo de nuevo en unos minutos, o escríbeme qué pasa.',
    ].join('\n'),
  vocaleTroppoLungo: () =>
    [
      'Tu mensaje de voz es demasiado largo para mí.',
      '',
      'Divídelo en dos más cortos: escucho los dos.',
    ].join('\n'),
  vocaleLungoAscoltato: () =>
    [
      'El mensaje era largo, pero lo he escuchado entero.',
      '',
      'La próxima vez puedes dividirlo en dos.',
    ].join('\n'),
  fotoNonCapita: () =>
    [
      'No he conseguido entender qué muestra la foto.',
      '',
      'Cuéntame con palabras qué se ve y dónde está.',
    ].join('\n'),
  fotoNonLetta: () =>
    [
      'No consigo mirar tu foto en este momento.',
      '',
      'No es culpa tuya: el problema está de mi lado.',
      '',
      'Cuéntame con palabras qué se ve y dónde está.',
    ].join('\n'),
  fileTroppoGrande: () =>
    [
      'El archivo es demasiado grande y no puedo abrirlo.',
      '',
      'Mándame un audio más corto o una foto más ligera.',
    ].join('\n'),
  posizioneRicevuta: () =>
    [
      'He recibido la ubicación, gracias.',
      '',
      'Ahora cuéntame qué pasa allí: bastan dos líneas o un audio.',
    ].join('\n'),
  formatoNonSupportato: () =>
    [
      'Por ahora leo texto, mensajes de voz y fotos.',
      '',
      'Cuéntame qué pasa con palabras, o mándame un audio.',
    ].join('\n'),
  errore: () =>
    [
      'Algo no ha funcionado por mi parte.',
      '',
      'Tu aviso no se ha perdido: inténtalo de nuevo en unos minutos.',
    ].join('\n'),
}

const RO: Partial<Frasario> = {
  benvenuto: () =>
    [
      'Bună, eu sunt VOCE.',
      '',
      'Spune-mi o problemă din cartierul tău. Scrie așa cum vorbești.',
      '',
      'Am nevoie de trei lucruri: ce se întâmplă, unde și de cât timp.',
      '',
      'De exemplu: «De trei săptămâni felinarul de pe via Verdi este stins. Seara nu se vede nimic și au căzut deja două persoane.»',
      '',
      'Poți să-mi trimiți și un mesaj vocal sau o fotografie.',
      '',
      'Compar ce primesc cu sesizările altor locuitori din zona ta.',
      'Dacă problema este aceeași, împreună deveniți un grup.',
      '',
      'Scrie-mi când vrei.',
    ].join('\n'),
  ricevuta: (url) =>
    [
      'Mulțumesc, am primit sesizarea ta.',
      '',
      'O compar cu sesizările altor locuitori din zona ta.',
      'Îți scriu de îndată ce intră într-o acțiune colectivă.',
      '',
      `Urmărește sesizarea aici: ${url}`,
    ].join('\n'),
  ricevutaVocale: (anteprima, url) =>
    [
      'Ți-am ascultat mesajul vocal. Am înțeles asta:',
      '',
      `«${anteprima}»`,
      '',
      'Dacă am înțeles greșit, trimite-l din nou sau scrie-mi.',
      '',
      `Urmărește sesizarea aici: ${url}`,
    ].join('\n'),
  ricevutaFoto: (url) =>
    [
      'Am primit fotografia și am descris ce arată.',
      '',
      'Fotografia rămâne privată: public apare doar descrierea.',
      '',
      `Urmărește sesizarea aici: ${url}`,
    ].join('\n'),
  ricevutaFotoSenzaTesto: (url) =>
    [
      'Am primit fotografia și am descris ce arată.',
      '',
      'Dacă poți, scrie-mi și ce se întâmplă și de cât timp.',
      '',
      'Fotografia rămâne privată: public apare doar descrierea.',
      '',
      `Urmărește sesizarea aici: ${url}`,
    ].join('\n'),
  ricevutaFotoSoloTesto: (url) =>
    [
      'Nu reușesc să mă uit la fotografia ta în acest moment.',
      '',
      'Am citit ce ai scris: sesizarea ta este salvată.',
      '',
      `Urmărește sesizarea aici: ${url}`,
    ].join('\n'),
  troppoBreve: () =>
    [
      'Am nevoie de câteva cuvinte în plus ca să înțeleg.',
      '',
      'Spune-mi ce s-a întâmplat, unde și de cât timp.',
    ].join('\n'),
  servonoDettagli: () =>
    [
      'Îmi lipsesc detalii: așa nu o pot compara cu celelalte.',
      '',
      'Spune-mi ce se întâmplă, unde și de cât timp.',
      '',
      'De exemplu: «De trei săptămâni felinarul de pe via Verdi este stins.»',
      '',
      'Scrie-mi-o din nou aici: o înlocuiește pe cea dinainte.',
    ].join('\n'),
  domandaSpecifica: (domanda) =>
    [
      'Îmi lipsește un singur lucru ca să o pot folosi:',
      '',
      domanda,
      '',
      'Scrie-mi sesizarea din nou cu această informație.',
    ].join('\n'),
  dettaglioInPiu: (domanda) =>
    [
      'Am tot ce îmi trebuie. Un lucru ar face-o mai puternică:',
      '',
      domanda,
      '',
      'Dacă știi, scrie-mi aici.',
    ].join('\n'),
  integrazioneAggiunta: (anteprima, url) =>
    [
      ...(anteprima
        ? ['Ți-am ascultat mesajul vocal. Am înțeles asta:', '', `«${anteprima}»`, '']
        : []),
      'L-am adăugat la sesizarea de dinainte: nu am deschis una nouă.',
      '',
      'O compar cu sesizările altor locuitori din zona ta.',
      '',
      `Urmărește sesizarea aici: ${url}`,
    ].join('\n'),
  inQuarantena: () =>
    [
      'Am primit sesizarea ta, dar deocamdată este oprită.',
      '',
      'Nu o compar cu celelalte: mai întâi trebuie citită de o persoană.',
      '',
      'Nu a fost ștearsă. Îți scriu de îndată ce se ia decizia.',
    ].join('\n'),
  chiediComune: () =>
    [
      'Un singur lucru: în ce localitate se întâmplă?',
      '',
      'Îmi trebuie ca să compar sesizarea ta cu ale celor care locuiesc lângă tine.',
      '',
      'E de ajuns numele, de exemplu: Milano',
    ].join('\n'),
  comuneRegistrato: (citta, quartiere) =>
    [
      `Perfect, ${citta}${quartiere ? ` — zona ${quartiere}` : ''}.`,
      '',
      'Nu te mai întreb: este valabil și pentru sesizările următoare.',
    ].join('\n'),
  comuneUnitoAGruppo: (citta) =>
    [
      `Perfect, ${citta}.`,
      '',
      'Sesizarea ta s-a alăturat altora din aceeași zonă: nu ești singur.',
    ].join('\n'),
  comuneNonCapito: () =>
    ['Nu am recunoscut localitatea.', '', 'Scrie-mi doar numele, de exemplu: Milano'].join('\n'),
  troppeSegnalazioni: (minuti) =>
    [
      'Ai trimis mai multe sesizări în puțin timp.',
      '',
      `Încearcă din nou peste circa ${minuti} minute: așa le tratez bine pe toate.`,
    ].join('\n'),
  ascoltoVocale: () => 'Îți ascult mesajul vocal. Dă-mi câteva secunde.',
  guardoFoto: () => 'Mă uit la fotografia ta. Dă-mi câteva secunde.',
  vocaleNonCapito: () =>
    [
      'Nu am reușit să înțeleg mesajul vocal.',
      '',
      'Încearcă într-un loc mai liniștit, sau scrie-mi ce se întâmplă.',
    ].join('\n'),
  vocaleNonAscoltato: () =>
    [
      'Nu reușesc să ascult mesajul tău vocal în acest moment.',
      '',
      'Nu este vina ta: problema este de partea mea.',
      '',
      'Încearcă din nou peste câteva minute, sau scrie-mi ce se întâmplă.',
    ].join('\n'),
  vocaleTroppoLungo: () =>
    [
      'Mesajul vocal este prea lung pentru mine.',
      '',
      'Împarte-l în două mesaje mai scurte: le ascult pe amândouă.',
    ].join('\n'),
  vocaleLungoAscoltato: () =>
    [
      'Mesajul era lung, dar l-am ascultat tot.',
      '',
      'Data viitoare poți să-l împarți în două.',
    ].join('\n'),
  fotoNonCapita: () =>
    [
      'Nu am reușit să înțeleg ce arată fotografia.',
      '',
      'Spune-mi în cuvinte ce se vede și unde este.',
    ].join('\n'),
  fotoNonLetta: () =>
    [
      'Nu reușesc să mă uit la fotografia ta în acest moment.',
      '',
      'Nu este vina ta: problema este de partea mea.',
      '',
      'Spune-mi în cuvinte ce se vede și unde este.',
    ].join('\n'),
  fileTroppoGrande: () =>
    [
      'Fișierul este prea mare și nu îl pot deschide.',
      '',
      'Trimite-mi un vocal mai scurt sau o fotografie mai mică.',
    ].join('\n'),
  posizioneRicevuta: () =>
    [
      'Am primit locația, mulțumesc.',
      '',
      'Acum spune-mi ce se întâmplă acolo: două rânduri sunt de ajuns.',
    ].join('\n'),
  formatoNonSupportato: () =>
    [
      'Deocamdată citesc text, mesaje vocale și fotografii.',
      '',
      'Spune-mi în cuvinte ce se întâmplă, sau trimite-mi un vocal.',
    ].join('\n'),
  errore: () =>
    [
      'Ceva nu a funcționat de partea mea.',
      '',
      'Sesizarea ta nu s-a pierdut: încearcă din nou peste câteva minute.',
    ].join('\n'),
}

// Le tre lingue qui sotto coprono i messaggi che una persona incontra per
// forza: il benvenuto, la conferma, la domanda sul comune, l'errore, i vocali e
// le foto. Il resto ripiega sull'italiano di proposito: preferiamo un ripiego
// dichiarato a una traduzione che non sappiamo rileggere.
const AR: Partial<Frasario> = {
  benvenuto: () =>
    [
      'مرحبا، أنا VOCE.',
      '',
      'احكِ لي عن مشكلة في حيّك. اكتب كما تتكلم، بلا رسميات.',
      '',
      'أحتاج ثلاثة أشياء: ماذا يحدث، أين، ومنذ متى.',
      '',
      'مثال: «منذ ثلاثة أسابيع مصباح شارع فيردي مطفأ. في الليل لا يُرى شيء وقد سقط شخصان.»',
      '',
      'يمكنك أيضا إرسال رسالة صوتية أو صورة.',
      '',
      'أقارن ما يصلني مع بلاغات سكان آخرين في منطقتك.',
      'إذا كانت المشكلة نفسها، تصبحون معا مجموعة.',
      '',
      'اكتب لي متى شئت.',
    ].join('\n'),
  ricevuta: (url) =>
    [
      'شكرا، وصلني بلاغك.',
      '',
      'أقارنه ببلاغات سكان آخرين في منطقتك.',
      '',
      `تابع بلاغك هنا: ${url}`,
    ].join('\n'),
  ricevutaVocale: (anteprima, url) =>
    [
      'استمعت إلى رسالتك الصوتية. هذا ما فهمته:',
      '',
      `«${anteprima}»`,
      '',
      'إذا أخطأت الفهم، أعد إرسالها أو اكتبها لي.',
      '',
      `تابع بلاغك هنا: ${url}`,
    ].join('\n'),
  ricevutaFoto: (url) =>
    [
      'وصلتني صورتك ووصفت ما تظهره.',
      '',
      'الصورة تبقى خاصة: في الصفحات العامة يظهر الوصف فقط.',
      '',
      `تابع بلاغك هنا: ${url}`,
    ].join('\n'),
  ricevutaFotoSoloTesto: (url) =>
    [
      'لا أستطيع النظر إلى صورتك الآن.',
      '',
      'قرأت ما كتبته: بلاغك محفوظ.',
      '',
      `تابع بلاغك هنا: ${url}`,
    ].join('\n'),
  troppoBreve: () =>
    ['أحتاج كلمات أكثر لأفهم.', '', 'احكِ لي ماذا حدث، أين، ومنذ متى.'].join('\n'),
  servonoDettagli: () =>
    [
      'تنقصني تفاصيل: هكذا لا أستطيع مقارنته بغيره.',
      '',
      'احكِ لي ماذا يحدث، أين، ومنذ متى.',
      '',
      'أعد كتابته هنا: يحل محل السابق.',
    ].join('\n'),
  inQuarantena: () =>
    [
      'وصلني بلاغك، لكنه متوقف حاليا.',
      '',
      'لا أقارنه بالبلاغات الأخرى: يجب أن يقرأه شخص أولا.',
      '',
      'لم يُحذف. سأكتب لك حالما يُتخذ القرار.',
    ].join('\n'),
  chiediComune: () =>
    [
      'شيء أخير: في أي بلدية يحدث هذا؟',
      '',
      'أحتاجه لمقارنة بلاغك ببلاغات من يسكنون قربك.',
      '',
      'يكفي الاسم، مثلا: Milano',
    ].join('\n'),
  comuneNonCapito: () => ['لم أتعرف على البلدية.', '', 'اكتب الاسم فقط، مثلا: Milano'].join('\n'),
  troppeSegnalazioni: (minuti) =>
    [
      'أرسلت عدة بلاغات في وقت قصير.',
      '',
      `أعد المحاولة بعد حوالي ${minuti} دقيقة.`,
    ].join('\n'),
  ascoltoVocale: () => 'أستمع إلى رسالتك الصوتية. امنحني بضع ثوان.',
  guardoFoto: () => 'أنظر إلى صورتك. امنحني بضع ثوان.',
  vocaleNonCapito: () =>
    ['لم أفهم رسالتك الصوتية.', '', 'أعد المحاولة في مكان أهدأ، أو اكتب لي.'].join('\n'),
  vocaleNonAscoltato: () =>
    [
      'لا أستطيع الاستماع إلى رسالتك الصوتية الآن.',
      '',
      'ليست غلطتك: المشكلة من جهتي.',
      '',
      'أعد المحاولة بعد بضع دقائق، أو اكتب لي ماذا يحدث.',
    ].join('\n'),
  vocaleTroppoLungo: () =>
    ['رسالتك الصوتية طويلة جدا.', '', 'قسّمها إلى رسالتين أقصر: سأستمع إليهما.'].join('\n'),
  fotoNonCapita: () =>
    ['لم أفهم ما تظهره الصورة.', '', 'احكِ لي بالكلمات ماذا يظهر وأين.'].join('\n'),
  fotoNonLetta: () =>
    [
      'لا أستطيع النظر إلى صورتك الآن.',
      '',
      'ليست غلطتك: المشكلة من جهتي.',
      '',
      'احكِ لي بالكلمات ماذا يظهر وأين.',
    ].join('\n'),
  fileTroppoGrande: () =>
    ['الملف كبير جدا ولا أستطيع فتحه.', '', 'أرسل رسالة صوتية أقصر أو صورة أخف.'].join('\n'),
  posizioneRicevuta: () =>
    ['وصلني الموقع، شكرا.', '', 'الآن احكِ لي ماذا يحدث هناك: سطران يكفيان.'].join('\n'),
  formatoNonSupportato: () =>
    ['حاليا أقرأ النصوص والرسائل الصوتية والصور.', '', 'احكِ لي ماذا يحدث، أو أرسل رسالة صوتية.'].join(
      '\n',
    ),
  errore: () => ['حدث خلل من جهتي.', '', 'بلاغك لم يضع: أعد المحاولة بعد دقائق.'].join('\n'),
}

const SQ: Partial<Frasario> = {
  benvenuto: () =>
    [
      'Përshëndetje, unë jam VOCE.',
      '',
      'Më trego një problem të lagjes sate. Shkruaj ashtu si flet.',
      '',
      'Më duhen tri gjëra: çfarë ndodh, ku, dhe prej sa kohësh.',
      '',
      'Për shembull: «Prej tri javësh llamba e rrugës Verdi është e fikur. Në mbrëmje nuk shihet asgjë dhe kanë rënë dy persona.»',
      '',
      'Mund të më dërgosh edhe një mesazh zanor ose një foto.',
      '',
      'Krahasoj atë që marr me sinjalizimet e banorëve të tjerë të zonës sate.',
      '',
      'Më shkruaj kur të duash.',
    ].join('\n'),
  ricevuta: (url) =>
    [
      'Faleminderit, e mora sinjalizimin tënd.',
      '',
      'Po e krahasoj me sinjalizimet e banorëve të tjerë të zonës sate.',
      '',
      `Ndiqe sinjalizimin këtu: ${url}`,
    ].join('\n'),
  ricevutaVocale: (anteprima, url) =>
    [
      'E dëgjova mesazhin tënd zanor. Kjo është ajo që kuptova:',
      '',
      `«${anteprima}»`,
      '',
      'Nëse kam kuptuar gabim, ma dërgo përsëri ose ma shkruaj.',
      '',
      `Ndiqe sinjalizimin këtu: ${url}`,
    ].join('\n'),
  ricevutaFoto: (url) =>
    [
      'E mora foton tënde dhe përshkrova çfarë tregon.',
      '',
      'Fotoja mbetet private: publikisht shfaqet vetëm përshkrimi.',
      '',
      `Ndiqe sinjalizimin këtu: ${url}`,
    ].join('\n'),
  ricevutaFotoSoloTesto: (url) =>
    [
      'Nuk arrij ta shoh foton tënde në këtë moment.',
      '',
      'Lexova atë që shkrove: sinjalizimi yt është i ruajtur.',
      '',
      `Ndiqe sinjalizimin këtu: ${url}`,
    ].join('\n'),
  troppoBreve: () =>
    ['Më duhen edhe disa fjalë për të kuptuar.', '', 'Më trego çfarë ndodhi, ku, dhe prej sa kohësh.'].join(
      '\n',
    ),
  servonoDettagli: () =>
    [
      'Më mungojnë detaje: kështu nuk mund ta krahasoj me të tjerat.',
      '',
      'Më trego çfarë ndodh, ku, dhe prej sa kohësh.',
      '',
      'Ma shkruaj përsëri këtu: zëvendëson atë të mëparshmen.',
    ].join('\n'),
  inQuarantena: () =>
    [
      'E mora sinjalizimin tënd, por për momentin është i ndalur.',
      '',
      'Nuk po e krahasoj me të tjerat: së pari duhet ta lexojë një person.',
      '',
      'Nuk është fshirë. Të shkruaj sapo të merret vendimi.',
    ].join('\n'),
  chiediComune: () =>
    [
      'Një gjë e fundit: në cilën bashki ndodh?',
      '',
      'Më duhet për ta krahasuar me sinjalizimet e atyre që jetojnë pranë teje.',
      '',
      'Mjafton emri, për shembull: Milano',
    ].join('\n'),
  comuneNonCapito: () =>
    ['Nuk e njoha bashkinë.', '', 'Më shkruaj vetëm emrin, për shembull: Milano'].join('\n'),
  troppeSegnalazioni: (minuti) =>
    [
      'Ke dërguar disa sinjalizime në pak kohë.',
      '',
      `Provo përsëri pas rreth ${minuti} minutash.`,
    ].join('\n'),
  ascoltoVocale: () => 'Po dëgjoj mesazhin tënd zanor. Më jep pak sekonda.',
  guardoFoto: () => 'Po shikoj foton tënde. Më jep pak sekonda.',
  vocaleNonCapito: () =>
    ['Nuk arrita ta kuptoj mesazhin zanor.', '', 'Provo në një vend më të qetë, ose më shkruaj.'].join(
      '\n',
    ),
  vocaleNonAscoltato: () =>
    [
      'Nuk arrij ta dëgjoj mesazhin tënd zanor në këtë moment.',
      '',
      'Nuk është faji yt: problemi është nga ana ime.',
      '',
      'Provo përsëri pas pak minutash, ose më shkruaj çfarë ndodh.',
    ].join('\n'),
  vocaleTroppoLungo: () =>
    ['Mesazhi zanor është shumë i gjatë për mua.', '', 'Ndaje në dy mesazhe më të shkurtra.'].join(
      '\n',
    ),
  fotoNonCapita: () =>
    ['Nuk kuptova çfarë tregon fotoja.', '', 'Më trego me fjalë çfarë shihet dhe ku është.'].join(
      '\n',
    ),
  fotoNonLetta: () =>
    [
      'Nuk arrij ta shoh foton tënde në këtë moment.',
      '',
      'Nuk është faji yt: problemi është nga ana ime.',
      '',
      'Më trego me fjalë çfarë shihet dhe ku është.',
    ].join('\n'),
  fileTroppoGrande: () =>
    ['Skedari është shumë i madh dhe nuk mund ta hap.', '', 'Dërgo një zanor më të shkurtër.'].join(
      '\n',
    ),
  posizioneRicevuta: () =>
    ['E mora vendndodhjen, faleminderit.', '', 'Tani më trego çfarë ndodh atje: mjaftojnë dy rreshta.'].join(
      '\n',
    ),
  formatoNonSupportato: () =>
    [
      'Për momentin lexoj tekst, mesazhe zanore dhe foto.',
      '',
      'Më trego me fjalë çfarë ndodh, ose dërgo një zanor.',
    ].join('\n'),
  errore: () =>
    [
      'Diçka nuk funksionoi nga ana ime.',
      '',
      'Sinjalizimi yt nuk humbi: provo përsëri pas pak minutash.',
    ].join('\n'),
}

const UK: Partial<Frasario> = {
  benvenuto: () =>
    [
      'Вітаю, я VOCE.',
      '',
      'Розкажи про проблему у своєму районі. Пиши так, як говориш.',
      '',
      'Мені потрібні три речі: що відбувається, де і як довго.',
      '',
      'Наприклад: «Три тижні ліхтар на вулиці Верді не працює. Увечері нічого не видно, вже впали двоє людей.»',
      '',
      'Можеш надіслати голосове повідомлення або фото.',
      '',
      'Я порівнюю те, що отримую, зі зверненнями інших мешканців твого району.',
      '',
      'Пиши мені, коли захочеш.',
    ].join('\n'),
  ricevuta: (url) =>
    [
      'Дякую, я отримав твоє звернення.',
      '',
      'Порівнюю його зі зверненнями інших мешканців твого району.',
      '',
      `Стеж за зверненням тут: ${url}`,
    ].join('\n'),
  ricevutaVocale: (anteprima, url) =>
    [
      'Я прослухав твоє голосове повідомлення. Ось що я зрозумів:',
      '',
      `«${anteprima}»`,
      '',
      'Якщо я зрозумів неправильно, надішли ще раз або напиши.',
      '',
      `Стеж за зверненням тут: ${url}`,
    ].join('\n'),
  ricevutaFoto: (url) =>
    [
      'Я отримав твоє фото і описав те, що на ньому видно.',
      '',
      'Фото залишається приватним: публічно показуємо лише опис.',
      '',
      `Стеж за зверненням тут: ${url}`,
    ].join('\n'),
  ricevutaFotoSoloTesto: (url) =>
    [
      'Зараз я не можу подивитися на твоє фото.',
      '',
      'Я прочитав те, що ти написав: твоє звернення збережено.',
      '',
      `Стеж за зверненням тут: ${url}`,
    ].join('\n'),
  troppoBreve: () =>
    ['Мені потрібно ще кілька слів, щоб зрозуміти.', '', 'Розкажи, що сталося, де і як довго.'].join(
      '\n',
    ),
  servonoDettagli: () =>
    [
      'Мені бракує деталей: так я не можу порівняти звернення з іншими.',
      '',
      'Розкажи, що відбувається, де і як довго.',
      '',
      'Напиши ще раз тут: нове замінить попереднє.',
    ].join('\n'),
  inQuarantena: () =>
    [
      'Я отримав твоє звернення, але поки що воно зупинене.',
      '',
      'Я не порівнюю його з іншими: спершу його має прочитати людина.',
      '',
      'Його не видалено. Я напишу тобі, щойно буде рішення.',
    ].join('\n'),
  chiediComune: () =>
    [
      'Останнє: у якій комуні це відбувається?',
      '',
      'Це потрібно, щоб порівняти твоє звернення зі зверненнями сусідів.',
      '',
      'Досить назви, наприклад: Milano',
    ].join('\n'),
  comuneNonCapito: () =>
    ['Я не впізнав комуну.', '', 'Напиши лише назву, наприклад: Milano'].join('\n'),
  troppeSegnalazioni: (minuti) =>
    [
      'Ти надіслав кілька звернень за короткий час.',
      '',
      `Спробуй ще раз приблизно через ${minuti} хвилин.`,
    ].join('\n'),
  ascoltoVocale: () => 'Слухаю твоє голосове повідомлення. Дай мені кілька секунд.',
  guardoFoto: () => 'Дивлюся на твоє фото. Дай мені кілька секунд.',
  vocaleNonCapito: () =>
    ['Я не зміг зрозуміти голосове повідомлення.', '', 'Спробуй у тихішому місці або напиши мені.'].join(
      '\n',
    ),
  vocaleNonAscoltato: () =>
    [
      'Зараз я не можу прослухати твоє голосове повідомлення.',
      '',
      'Це не твоя провина: проблема з мого боку.',
      '',
      'Спробуй за кілька хвилин або напиши, що відбувається.',
    ].join('\n'),
  vocaleTroppoLungo: () =>
    ['Твоє голосове повідомлення задовге для мене.', '', 'Поділи його на два коротших.'].join('\n'),
  fotoNonCapita: () =>
    ['Я не зрозумів, що показано на фото.', '', 'Розкажи словами, що видно і де це.'].join('\n'),
  fotoNonLetta: () =>
    [
      'Зараз я не можу подивитися на твоє фото.',
      '',
      'Це не твоя провина: проблема з мого боку.',
      '',
      'Розкажи словами, що видно і де це.',
    ].join('\n'),
  fileTroppoGrande: () =>
    ['Файл завеликий, я не можу його відкрити.', '', 'Надішли коротше голосове або легше фото.'].join(
      '\n',
    ),
  posizioneRicevuta: () =>
    ['Я отримав місце, дякую.', '', 'Тепер розкажи, що там відбувається: досить двох рядків.'].join(
      '\n',
    ),
  formatoNonSupportato: () =>
    [
      'Поки що я читаю текст, голосові повідомлення і фото.',
      '',
      'Розкажи словами, що відбувається, або надішли голосове.',
    ].join('\n'),
  errore: () =>
    [
      'Щось не спрацювало з мого боку.',
      '',
      'Твоє звернення не втрачено: спробуй за кілька хвилин.',
    ].join('\n'),
}

/**
 * Frasari disponibili. Le lingue di `LINGUE_RISPOSTA` che non compaiono qui
 * ripiegano sull'italiano: il ripiego è dichiarato, non silenzioso.
 *
 * Le traduzioni sono scritte a mano e vanno rilette da una persona madrelingua
 * prima del pilot. Un messaggio che promette male in una lingua che non
 * sappiamo rileggere è peggio di un messaggio in italiano.
 */
const FRASARI: Record<string, Partial<Frasario>> = {
  it: IT,
  en: EN,
  fr: FR,
  es: ES,
  ro: RO,
  ar: AR,
  sq: SQ,
  uk: UK,
}

/**
 * Compone un messaggio del bot nella lingua del cittadino.
 *
 * @param chiave  quale messaggio
 * @param lingua  codice ISO 639-1 (accetta anche `it-IT`); ripiega sull'italiano
 * @param parametri gli argomenti di quel messaggio, tipizzati sulla chiave
 */
export function messaggio<K extends ChiaveMessaggio>(
  chiave: K,
  lingua: string | null | undefined,
  ...parametri: Parameters<Frasario[K]>
): string {
  const codice = normalizzaLingua(lingua)
  const scelto = FRASARI[codice]?.[chiave] ?? IT[chiave]
  return (scelto as (...p: Parameters<Frasario[K]>) => string)(...parametri)
}

/**
 * Messaggi in italiano nella forma storica (stringhe dove erano stringhe).
 *
 * Resta esportato perché altri moduli lo importano: chi scrive codice nuovo usa
 * `messaggio(chiave, lingua, ...)`, che sa rispondere anche a chi non parla
 * italiano.
 */
export const MESSAGGI = {
  benvenuto: IT.benvenuto(),
  ricevuta: (url: string) => IT.ricevuta(url),
  troppoBreve: IT.troppoBreve(),
  servonoDettagli: IT.servonoDettagli(),
  chiediComune: IT.chiediComune(),
  comuneRegistrato: (citta: string, quartiere: string | null) =>
    IT.comuneRegistrato(citta, quartiere),
  comuneUnitoAGruppo: (citta: string) => IT.comuneUnitoAGruppo(citta),
  comuneNonCapito: IT.comuneNonCapito(),
  troppeSegnalazioni: (minuti: number) => IT.troppeSegnalazioni(minuti),
  /** @deprecated Vocali e foto ora si leggono: usa `formatoNonSupportato`. */
  soloTesto: IT.formatoNonSupportato(),
  formatoNonSupportato: IT.formatoNonSupportato(),
  inQuarantena: IT.inQuarantena(),
  errore: IT.errore(),
}
