import { serverEnv } from '@/lib/config/env'
import { logger } from '@/lib/utils/logger'

const API = 'https://api.telegram.org'

/**
 * Invia un messaggio a un cittadino su Telegram.
 *
 * Non lancia: se Telegram è irraggiungibile la segnalazione è già salvata, e
 * far fallire il webhook provocherebbe un rinvio dello stesso update.
 */
export async function inviaMessaggioTelegram(chatId: number, testo: string): Promise<void> {
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
    }
  } catch (errore) {
    logger.warn('telegram.invio_eccezione', {
      chat_id: chatId,
      messaggio: errore instanceof Error ? errore.message : String(errore),
    })
  }
}

/**
 * Messaggi del bot.
 *
 * Regole di scrittura (Designers Italia): dai del tu, frasi sotto le 15 parole,
 * zero anglicismi, nessuna promessa che il sistema non può mantenere.
 * In particolare NON si scrive «lo mandiamo al Comune»: non è vero finché un
 * gruppo non raggiunge la soglia e una persona non revisiona l'atto.
 */
export const MESSAGGI = {
  benvenuto: [
    'Ciao, sono VOCE.',
    '',
    'Raccontami un problema del tuo quartiere: scrivi come parli, senza formalità.',
    '',
    'Confronto quello che mi scrivi con le segnalazioni di altri cittadini della tua zona.',
    'Se il problema è lo stesso, insieme diventate un gruppo — e da lì nasce un\'azione.',
    '',
    'Puoi scrivermi quando vuoi. Rispondo sempre.',
  ].join('\n'),

  ricevuta: (url: string) =>
    [
      'Grazie, ho ricevuto la tua segnalazione.',
      '',
      'La sto confrontando con quelle di altri cittadini della tua zona.',
      'Ti scrivo appena diventa parte di un\'azione collettiva.',
      '',
      `Segui la tua segnalazione qui: ${url}`,
    ].join('\n'),

  troppoBreve:
    'Ho bisogno di qualche parola in più per capire.\n\nRaccontami cosa è successo, dove, e da quanto tempo va avanti.',

  // Si chiede il comune una volta sola, e si spiega perché: una domanda senza
  // motivo sembra burocrazia, con il motivo diventa collaborazione.
  chiediComune:
    'Una cosa sola e ho finito: in che comune succede?\n\n' +
    'Mi serve per confrontare la tua segnalazione con quelle di chi vive vicino a te.\n\n' +
    'Rispondi anche solo con il nome, per esempio: Milano',

  comuneRegistrato: (citta: string, quartiere: string | null) =>
    [
      `Perfetto, ${citta}${quartiere ? ` — zona ${quartiere}` : ''}.`,
      '',
      'Non te lo chiederò più: vale anche per le tue prossime segnalazioni.',
    ].join('\n'),

  comuneUnitoAGruppo: (citta: string) =>
    [
      `Perfetto, ${citta}.`,
      '',
      'La tua segnalazione si è unita ad altre della stessa zona: non sei da solo.',
    ].join('\n'),

  comuneNonCapito:
    'Non ho riconosciuto il comune.\n\nScrivimi solo il nome, per esempio: Milano',

  troppeSegnalazioni: (minuti: number) =>
    [
      'Hai inviato diverse segnalazioni in poco tempo.',
      '',
      `Riprova fra circa ${minuti} minuti: così riesco a trattarle tutte per bene.`,
    ].join('\n'),

  soloTesto:
    'Per ora leggo solo messaggi scritti.\n\nRaccontami a parole cosa è successo: le foto e i vocali arrivano presto.',

  errore:
    'Qualcosa non ha funzionato dalla mia parte.\n\nLa tua segnalazione non è andata persa: riprova fra qualche minuto.',
}
