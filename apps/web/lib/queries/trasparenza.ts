/**
 * Letture del confronto fra comuni per la pagina /trasparenza (PLAN2 §6.2).
 *
 * Sta in un file suo e non dentro `lib/queries/public.ts` perché legge una
 * vista sola e porta con sé una regola di presentazione che le altre query non
 * hanno: sotto una certa quantità di atti la percentuale non si mostra.
 *
 * Un solo punto fermo da cui discende tutto il resto. La vista
 * `public_city_responsiveness` conta **solo** le risposte confermate da una
 * persona (`action_responses.confirmed_by is not null`). Non si aggira, non si
 * integra con altri conteggi «per completezza»: scrivere in pagina che un
 * comune non ha risposto, quando invece aveva risposto e la macchina aveva
 * letto male, è un danno che non si ripara con una rettifica (PLAN2 §3.2).
 *
 * Come `lib/queries/public.ts`, degrada con grazia: se Supabase è
 * irraggiungibile la sezione mostra zero righe, non un errore 500. Il resto
 * della pagina di trasparenza continua a funzionare.
 */

import { createAnonSupabase } from '@/lib/supabase/anon'
import { logger, serializeError } from '@/lib/utils/logger'
import type { PublicCityResponsiveness } from '@voce/db'

/**
 * Atti inviati sotto i quali la percentuale non si mostra.
 *
 * Con quattro atti ogni singola risposta muove la quota di venticinque punti:
 * quello non è un tasso di risposta, è il caso. Pubblicare «25%» accanto al
 * nome di un comune quando il campione è di quattro lettere dà a un numero
 * fragile l'aspetto di una statistica, ed è disonesto anche quando il numero
 * per caso è giusto. Sotto la soglia la pagina mostra i valori assoluti
 * («1 su 4»), che dicono il vero senza fingere precisione.
 *
 * Cinque e non dieci perché una soglia troppo alta nasconderebbe per mesi
 * l'unica informazione che la pagina esiste per dare.
 */
export const SOGLIA_PERCENTUALE = 5

export interface RisposteComune {
  citta: string
  /** Atti in stato 'inviata' o 'risposta_ricevuta': un invio resta un invio. */
  attiInviati: number
  /** Prime risposte confermate da una persona. Mai le classificazioni automatiche. */
  risposteConfermate: number
  /** Percentuale intera, oppure null quando gli atti sono meno di SOGLIA_PERCENTUALE. */
  quotaRisposta: number | null
  /** Giorni fra invio e prima risposta. null se nessuna riga ha date utilizzabili. */
  giorniMedi: number | null
  accolte: number
  respinte: number
  interlocutorie: number
  irricevibili: number
  /** true quando il campione è troppo piccolo per una percentuale. */
  campioneRidotto: boolean
}

export interface RiepilogoRisposte {
  comuni: number
  attiInviati: number
  risposteConfermate: number
  /** null sotto la soglia, con la stessa regola applicata ai singoli comuni. */
  quotaRisposta: number | null
}

function numero(valore: number | null | undefined): number {
  return Number(valore ?? 0)
}

/**
 * Quanto rispondono i comuni.
 *
 * Ordinate per nome, non per quota di risposta: l'ordinamento è già un
 * giudizio, e questa pagina mostra numeri, non classifiche. Chi legge decide
 * da sé quale aggettivo meritano.
 */
export async function getRisposteComuni(): Promise<RisposteComune[]> {
  try {
    const sb = createAnonSupabase()
    const { data, error } = await sb
      .from('public_city_responsiveness')
      .select('*')
      .order('city', { ascending: true })

    if (error) throw error

    const righe = (data ?? []) as PublicCityResponsiveness[]

    return righe
      // Una riga senza comune non è attribuibile a nessuno: non ha senso
      // mostrarla e non ha senso sommarla al totale.
      .filter((riga): riga is PublicCityResponsiveness & { city: string } =>
        typeof riga.city === 'string' && riga.city.trim().length > 0,
      )
      .map((riga) => {
        const attiInviati = numero(riga.actions_sent)
        const risposteConfermate = numero(riga.responses_confirmed)
        const campioneRidotto = attiInviati < SOGLIA_PERCENTUALE

        return {
          citta: riga.city,
          attiInviati,
          risposteConfermate,
          quotaRisposta:
            campioneRidotto || attiInviati === 0
              ? null
              : Math.round((risposteConfermate / attiInviati) * 100),
          // avg_response_days è null quando nessuna risposta confermata ha date
          // coerenti: la vista scarta gli atti senza data d'invio e le risposte
          // protocollate prima dell'invio. Un buco qui si dice, non si riempie
          // con uno zero che si leggerebbe come «risponde in giornata».
          giorniMedi: riga.avg_response_days === null ? null : Number(riga.avg_response_days),
          accolte: numero(riga.accolte),
          respinte: numero(riga.respinte),
          interlocutorie: numero(riga.interlocutorie),
          irricevibili: numero(riga.irricevibili),
          campioneRidotto,
        }
      })
  } catch (errore) {
    // PostgrestError non è un Error: String(errore) darebbe "[object Object]".
    logger.error('query.trasparenza.failed', {
      operazione: 'risposte-comuni',
      ...serializeError(errore),
    })
    return []
  }
}

/**
 * Totali del confronto.
 *
 * Somma solo quello che si può sommare. Nessun tempo medio complessivo: la
 * media delle medie dei comuni non è la media dei giorni di attesa, e
 * ponderarla correttamente richiederebbe dati che la vista non espone. Un
 * numero quasi giusto in una pagina che chiede conto alle istituzioni vale meno
 * di un numero assente.
 */
export function riepilogaRisposte(righe: RisposteComune[]): RiepilogoRisposte {
  const attiInviati = righe.reduce((acc, r) => acc + r.attiInviati, 0)
  const risposteConfermate = righe.reduce((acc, r) => acc + r.risposteConfermate, 0)

  return {
    comuni: righe.length,
    attiInviati,
    risposteConfermate,
    quotaRisposta:
      attiInviati >= SOGLIA_PERCENTUALE
        ? Math.round((risposteConfermate / attiInviati) * 100)
        : null,
  }
}
