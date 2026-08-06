/**
 * Canale di posta elettronica.
 *
 * Chi segnala dal sito lascia un'email, non un contatto Telegram. Senza questo
 * canale la promessa «ti scrivo appena diventa parte di un'azione collettiva»
 * resta non mantenuta proprio per chi si è registrato con più attenzione.
 *
 * PERCHÉ UNA `fetch` E NON UN SDK
 * Il contratto di build §1 vieta di aggiungere dipendenze: non c'è `resend` né
 * `nodemailer` nel repo. L'invio passa quindi da una chiamata HTTP a un
 * endpoint compatibile con Resend (`POST /emails`, corpo JSON
 * `{ from, to, subject, text }`, header `Authorization: Bearer <chiave>`).
 * Formato verificato sui docs Resend: `to` è un **array** di destinatari.
 *
 * PERCHÉ LANCIA INVECE DI TACERE
 * Se le variabili non sono configurate questa funzione lancia. La notifica che
 * la stava usando finisce in `notifications.failed_at` con la ragione, e da lì
 * compare nel pannello di amministrazione. È l'opposto di fingere di aver
 * spedito: una promessa non mantenuta deve essere vista da una persona, non
 * sepolta in un log.
 *
 * **Solo server** (legge segreti).
 */

import { serverEnv } from '@/lib/config/env'
import { logger } from '@/lib/utils/logger'

/**
 * Spedisce un'email di servizio a un cittadino.
 *
 * @param a         indirizzo del destinatario
 * @param oggetto   riga dell'oggetto, già in lingua
 * @param testo     corpo in testo semplice, già in lingua
 *
 * @throws Error se il canale non è configurato o se il servizio rifiuta l'invio
 */
export async function inviaEmail(a: string, oggetto: string, testo: string): Promise<void> {
  const url = serverEnv.EMAIL_API_URL
  const chiave = serverEnv.EMAIL_API_KEY
  const mittente = serverEnv.EMAIL_FROM

  const mancanti: string[] = []
  if (!url) mancanti.push('EMAIL_API_URL')
  if (!chiave) mancanti.push('EMAIL_API_KEY')
  if (!mittente) mancanti.push('EMAIL_FROM')

  if (mancanti.length > 0) {
    throw new Error(`canale email non configurato: mancano ${mancanti.join(', ')}`)
  }

  let risposta: Response
  try {
    risposta = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${chiave}`,
      },
      body: JSON.stringify({
        from: mittente,
        to: [a],
        subject: oggetto,
        text: testo,
      }),
    })
  } catch (errore) {
    // Rete irraggiungibile o DNS: è un guasto ritentabile, non un indirizzo
    // sbagliato. Il chiamante lo distingue solo dal numero di tentativi.
    throw new Error(
      `servizio email irraggiungibile: ${errore instanceof Error ? errore.message : String(errore)}`,
    )
  }

  if (!risposta.ok) {
    // Il corpo dell'errore del fornitore può contenere l'indirizzo del
    // destinatario: non finisce nei log (il logger oscura i campi personali) e
    // in `last_error` viene ripulito dal trigger `scrub_notification_error`.
    const corpo = await risposta.text().catch(() => '')
    logger.warn('email.invio_rifiutato', { status: risposta.status })
    throw new Error(`invio email rifiutato (HTTP ${risposta.status}): ${corpo.slice(0, 120)}`)
  }
}
