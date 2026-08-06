import { NextResponse, after, type NextRequest } from 'next/server'

import type { Database } from '@voce/db'

import { createServiceClient } from '@/lib/supabase/service'
import { serverEnv } from '@/lib/config/env'
import { MAX_AUDIO_SECONDS } from '@/lib/config/constants'
import { logger } from '@/lib/utils/logger'
import { checkReportRateLimit } from '@/lib/security/rate-limit'
import { triageReport } from '@/lib/ai/triage'
import { aggiornaLuogoSegnalazione, estraiLuogo } from '@/lib/ai/luogo'
import { trascriviAudio } from '@/lib/ai/trascrizione'
import { descriviFoto } from '@/lib/ai/visione'
import { scaricaFileTelegram } from '@/lib/media/telegram-file'
import { archiviaMedia, type MediaDaArchiviare } from '@/lib/media/archivio'
import { inviaMessaggioTelegram, messaggio, normalizzaLingua } from '@/lib/channels/telegram'

// L'SDK OpenAI e il client Supabase con service role girano su Node, non su edge.
export const runtime = 'nodejs'
export const maxDuration = 60

const LUNGHEZZA_MINIMA = 15

/**
 * Oltre questa durata il vocale non si trascrive.
 *
 * Non è un giudizio sul cittadino: è il budget della funzione. La trascrizione
 * gira PRIMA di salvare — `raw_text` non può essere vuoto — e sopra qualche
 * minuto rischia di sforare `maxDuration`, cioè di non rispondere affatto.
 * Fino a MAX_AUDIO_SECONDS non si dice niente; fra MAX_AUDIO_SECONDS e questo
 * limite si ascolta tutto e lo si dice; oltre, si chiede di dividerlo in due.
 */
const LIMITE_ASSOLUTO_AUDIO_SECONDI = MAX_AUDIO_SECONDS * 2

/** Quanto della trascrizione si rimanda indietro al cittadino per conferma. */
const ANTEPRIMA_CARATTERI = 220

/**
 * Testo salvato quando un modello si guasta e il racconto non è leggibile.
 *
 * Non è il racconto del cittadino e non deve mai essere scambiato per tale: la
 * riga nasce con `status = 'archiviato'`, quindi resta fuori dal triage, dal
 * cron di recupero, dai gruppi e da ogni pagina pubblica. Serve a una cosa
 * sola: tenere insieme il cittadino, il momento e il file allegato, così che
 * quello che ha mandato esista ancora domani.
 */
const TESTO_VOCALE_NON_TRASCRITTO =
  '[Vocale ricevuto ma non trascritto: il servizio di trascrizione non ha risposto. ' +
  "L'audio è in report_media con transcript nullo. Questa riga non è una segnalazione.]"

const TESTO_FOTO_NON_DESCRITTA =
  '[Foto ricevuta ma non descritta: il servizio di descrizione non ha risposto. ' +
  "L'immagine è in report_media con description nulla. Questa riga non è una segnalazione.]"

type CittadinoInsert = Database['public']['Tables']['citizens']['Insert']

/** Media già trattato e pronto per il bucket privato, senza ancora il report. */
type MediaPronto = Omit<MediaDaArchiviare, 'reportId'>

/**
 * Taglia la trascrizione a una lunghezza leggibile, senza spezzare le parole.
 * Serve solo per rimandarla indietro: nel database va il testo intero.
 */
function anteprimaDi(testo: string): string {
  if (testo.length <= ANTEPRIMA_CARATTERI) return testo
  const tagliato = testo.slice(0, ANTEPRIMA_CARATTERI)
  const ultimoSpazio = tagliato.lastIndexOf(' ')
  return `${(ultimoSpazio > 60 ? tagliato.slice(0, ultimoSpazio) : tagliato).trimEnd()}…`
}

/**
 * Webhook del bot Telegram.
 *
 * Ordine delle operazioni, scelto perché non si perda mai il messaggio di un
 * cittadino: prima si salva la segnalazione, poi si risponde alla persona,
 * infine si fa il lavoro pesante (archiviazione del media, triage) dopo la
 * risposta HTTP.
 *
 * Se il triage fallisce, il report resta 'nuovo' e il cron di recupero lo
 * ripesca. Se fallisse il salvataggio, invece, restituiamo 500 e Telegram
 * rinvia l'update: in nessuno dei due casi il racconto va perso.
 *
 * Unica eccezione all'ordine: vocali e foto vanno trascritti o descritti PRIMA
 * dell'inserimento, perché `raw_text` non può essere vuoto e un segnaposto
 * salvato nel database è un segnaposto che prima o poi finisce in una pagina.
 * Per questo, appena arriva un media, si manda subito una riga che dice che lo
 * stiamo ascoltando: chi manda un vocale altrimenti resta davanti a un silenzio.
 */
export async function POST(req: NextRequest) {
  // --- Autenticazione del webhook ------------------------------------------
  // Senza questo controllo, chiunque scopra l'URL può iniettare segnalazioni
  // false e inquinare i gruppi su cui poi si costruisce un esposto.
  const segreto = req.headers.get('x-telegram-bot-api-secret-token')
  if (!segreto || segreto !== serverEnv.TELEGRAM_WEBHOOK_SECRET) {
    logger.warn('telegram.webhook_non_autorizzato', {
      ha_header: Boolean(segreto),
    })
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let update: TelegramUpdate
  try {
    update = (await req.json()) as TelegramUpdate
  } catch {
    return NextResponse.json({ ok: true })
  }

  const msgTelegram = update.message ?? update.edited_message
  const chatId = msgTelegram?.chat?.id
  const mittente = msgTelegram?.from

  // Update che non ci riguardano (modifiche di canale, callback...): 200 e via,
  // altrimenti Telegram continua a rinviarli.
  if (!msgTelegram || !chatId || !mittente || mittente.is_bot) {
    return NextResponse.json({ ok: true })
  }

  // Prima ipotesi sulla lingua: quella dell'applicazione Telegram di chi scrive.
  // È un indizio sulla lingua in cui vuole essere trattato, non sulla lingua in
  // cui ha scritto: quella la stabilisce il triage, e vince appena arriva.
  let lingua = normalizzaLingua(mittente.language_code)

  const testoScritto = msgTelegram.text?.trim() ?? ''
  const comando = testoScritto.startsWith('/')
    ? (testoScritto.slice(1).split(/[\s@]/)[0] ?? '').toLowerCase()
    : null

  if (comando === 'start' || comando === 'aiuto' || comando === 'help') {
    await inviaMessaggioTelegram(chatId, messaggio('benvenuto', lingua))
    return NextResponse.json({ ok: true })
  }

  const sb = createServiceClient()

  try {
    // --- Cittadino ---------------------------------------------------------
    // Si legge prima di scrivere per due motivi: sapere se è la prima volta che
    // ci scrive (e quindi mostrargli l'esempio), e non sovrascrivere con null
    // campi che qualcuno ha già riempito.
    const { data: giaNoto } = await sb
      .from('citizens')
      .select('id, pending_city_report_id, preferred_language')
      .eq('telegram_id', mittente.id)
      .maybeSingle()

    const patch: CittadinoInsert = {
      telegram_id: mittente.id,
      last_seen_at: new Date().toISOString(),
    }
    if (mittente.first_name) patch.display_name = mittente.first_name
    // `preferred_language` NON si scrive qui di proposito: la colonna è del
    // triage, che la riempie solo per chi ha scritto davvero in un'altra lingua.
    // Riempirla con la lingua dell'applicazione Telegram la riempirebbe per
    // tutti, e da lì non si distinguerebbe più una scelta da un valore
    // predefinito — un italiano con il telefono in inglese resterebbe inglese
    // per sempre.

    const { data: cittadino, error: erroreCittadino } = await sb
      .from('citizens')
      .upsert(patch, { onConflict: 'telegram_id' })
      .select('id, pending_city_report_id, preferred_language')
      .single()

    if (erroreCittadino || !cittadino) {
      throw new Error(`upsert cittadino fallito: ${erroreCittadino?.message}`)
    }

    lingua = normalizzaLingua(cittadino.preferred_language ?? lingua)

    // Chi non abbiamo mai visto riceve l'esempio di segnalazione fatta bene,
    // anche se non ha scritto /start: la maggior parte delle persone il primo
    // messaggio lo scrive subito, e senza l'esempio scrive «c'è un problema».
    if (!giaNoto) {
      await inviaMessaggioTelegram(chatId, messaggio('benvenuto', lingua))
    }

    // --- Che cosa ci ha mandato --------------------------------------------
    const vocale = msgTelegram.voice ?? msgTelegram.audio
    // L'array `photo` contiene la stessa immagine in più dimensioni: l'ultima è
    // la più grande, ed è l'unica su cui si legga la targa di una via.
    const foto = msgTelegram.photo?.at(-1)

    // Il limite anti abuso si controlla PRIMA di scaricare e trascrivere: un
    // vocale costa soldi a ogni invio, e farlo dopo significherebbe pagare per
    // il flooding che stiamo cercando di fermare.
    let limiteGiaVerificato = false
    if (vocale || foto) {
      const limite = await checkReportRateLimit(cittadino.id, 'telegram')
      if (!limite.allowed) {
        await inviaMessaggioTelegram(
          chatId,
          messaggio('troppeSegnalazioni', lingua, Math.ceil(limite.retryAfterSeconds / 60)),
        )
        return NextResponse.json({ ok: true })
      }
      limiteGiaVerificato = true
    }

    let testo = ''
    let media: MediaPronto | null = null

    /**
     * Vale 'audio' o 'foto' quando il guasto è NOSTRO: il modello non ha
     * risposto e il racconto non è leggibile. In quel caso la segnalazione si
     * salva lo stesso (il file è la cosa da non perdere) ma non prosegue: né
     * domanda sul comune, né controllo di lunghezza, né triage, né gruppo.
     */
    let guasto: 'audio' | 'foto' | null = null

    if (vocale) {
      // --- Messaggio vocale (PLAN2 §2.1) ----------------------------------
      if (vocale.duration && vocale.duration > LIMITE_ASSOLUTO_AUDIO_SECONDI) {
        await inviaMessaggioTelegram(chatId, messaggio('vocaleTroppoLungo', lingua))
        return NextResponse.json({ ok: true })
      }

      await inviaMessaggioTelegram(chatId, messaggio('ascoltoVocale', lingua))

      const scarico = await scaricaFileTelegram(vocale.file_id, {
        mimeDichiarato: vocale.mime_type,
        estensioneRipiego: 'oga',
      })

      if (!scarico.ok) {
        await inviaMessaggioTelegram(
          chatId,
          messaggio(
            scarico.motivo === 'troppo_grande' ? 'fileTroppoGrande' : 'vocaleNonCapito',
            lingua,
          ),
        )
        return NextResponse.json({ ok: true })
      }

      const durata = vocale.duration ?? 0
      const esito = await trascriviAudio({
        contenuto: scarico.file.contenuto,
        nomeFile: `vocale.${scarico.file.estensione}`,
        mimeType: scarico.file.mimeType,
        durataSecondi: durata,
      })

      // Audio senza parlato: qui sì che ha senso chiedere di ripetere. Non c'è
      // niente da salvare, perché non è stato detto niente.
      if (esito.stato === 'vuota') {
        await inviaMessaggioTelegram(chatId, messaggio('vocaleNonCapito', lingua))
        return NextResponse.json({ ok: true })
      }

      if (esito.stato === 'guasto') {
        // Il guasto è nostro. Trenta secondi di voce di una persona che ha
        // aspettato otto ore al pronto soccorso non si buttano perché OpenAI
        // non risponde: si salvano, e non le si dà la colpa.
        logger.error('telegram.trascrizione_guasta', {
          citizen_id: cittadino.id,
          update_id: update.update_id,
          motivo: esito.motivo,
          duration_seconds: durata,
        })
        guasto = 'audio'
        testo = TESTO_VOCALE_NON_TRASCRITTO
      } else {
        testo = esito.testo

        if (durata > MAX_AUDIO_SECONDS) {
          await inviaMessaggioTelegram(chatId, messaggio('vocaleLungoAscoltato', lingua))
        }
      }

      media = {
        kind: 'audio',
        contenuto: scarico.file.contenuto,
        mimeType: scarico.file.mimeType,
        estensione: scarico.file.estensione,
        chiave: scarico.file.fileUniqueId,
        durataSecondi: durata || null,
        // Su guasto resta null di proposito: `report_media.transcript` nullo su
        // un audio archiviato è la chiave con cui un lavoro futuro ritroverà i
        // vocali da ritrascrivere. Scriverci dentro il segnaposto la
        // cancellerebbe.
        trascrizione: guasto ? null : testo,
      }
    } else if (foto) {
      // --- Foto (PLAN2 §2.3) ----------------------------------------------
      await inviaMessaggioTelegram(chatId, messaggio('guardoFoto', lingua))

      const scarico = await scaricaFileTelegram(foto.file_id, { estensioneRipiego: 'jpg' })

      if (!scarico.ok) {
        await inviaMessaggioTelegram(
          chatId,
          messaggio(scarico.motivo === 'troppo_grande' ? 'fileTroppoGrande' : 'fotoNonCapita', lingua),
        )
        return NextResponse.json({ ok: true })
      }

      const visione = await descriviFoto({
        contenuto: scarico.file.contenuto,
        mimeType: scarico.file.mimeType,
      })

      // La didascalia contiene spesso il racconto vero: la foto mostra la buca,
      // le parole dicono da quanto tempo c'è e chi è già caduto.
      const didascalia = msgTelegram.caption?.trim() ?? ''

      if (!visione) {
        // `descriviFoto` restituisce null sia quando il modello non produce
        // niente sia quando il servizio è guasto: da qui i due casi non si
        // distinguono (vedi il report finale, modifica richiesta a
        // lib/ai/visione.ts). In entrambi la foto e le parole del cittadino non
        // si buttano.
        logger.error('telegram.visione_fallita', {
          citizen_id: cittadino.id,
          update_id: update.update_id,
          ha_didascalia: didascalia.length > 0,
          bytes: scarico.file.contenuto.byteLength,
        })

        if (didascalia.length >= LUNGHEZZA_MINIMA) {
          // Le parole scritte bastano da sole: la segnalazione prosegue con
          // quelle e la foto resta allegata, solo senza descrizione.
          testo = didascalia
        } else {
          guasto = 'foto'
          // Anche una didascalia corta è roba del cittadino: si conserva.
          testo = didascalia
            ? `${TESTO_FOTO_NON_DESCRITTA}\nTesto inviato con la foto: ${didascalia}`
            : TESTO_FOTO_NON_DESCRITTA
        }
      } else {
        const indizio = visione.indizioLuogo ? `\nScritte leggibili: ${visione.indizioLuogo}.` : ''

        testo = didascalia
          ? `${didascalia}\n\nDescrizione della foto allegata: ${visione.descrizione}${indizio}`
          : `Segnalazione inviata come foto, senza testo. Descrizione dell'immagine: ${visione.descrizione}${indizio}`
      }

      media = {
        kind: 'foto',
        contenuto: scarico.file.contenuto,
        mimeType: scarico.file.mimeType,
        estensione: scarico.file.estensione,
        chiave: scarico.file.fileUniqueId,
        // Null quando la descrizione non c'è: `report_media.description` nulla
        // su una foto archiviata dice esattamente quali immagini restano da
        // descrivere.
        descrizione: visione?.descrizione ?? null,
      }
    } else if (testoScritto) {
      testo = testoScritto
    } else if (msgTelegram.location) {
      // Una posizione senza racconto non è una segnalazione: non sappiamo cosa
      // sia successo lì. Non si ignora in silenzio, si trasforma in una domanda.
      await inviaMessaggioTelegram(chatId, messaggio('posizioneRicevuta', lingua))
      return NextResponse.json({ ok: true })
    } else {
      // Video, documenti, adesivi, contatti: si dice cosa sappiamo leggere.
      await inviaMessaggioTelegram(chatId, messaggio('formatoNonSupportato', lingua))
      return NextResponse.json({ ok: true })
    }

    // --- Risposta a «in che comune?» ---------------------------------------
    // Se stiamo aspettando un comune, questo messaggio è quasi sempre la
    // risposta. Ma può anche essere una nuova segnalazione da parte di chi ha
    // ignorato la domanda: in quel caso non va persa.
    // Vale anche per i vocali: «Milano» detto a voce è già diventato testo.
    // Su guasto si salta: `testo` è un segnaposto, non parole di nessuno.
    // Cercarci dentro un comune sarebbe spesa inutile, e sbagliarlo
    // significherebbe rispondere «perfetto, Milano» a chi non ha detto Milano.
    if (!guasto && cittadino.pending_city_report_id) {
      const luogo = await estraiLuogo(testo)

      if (luogo?.is_place && luogo.city) {
        const { clusterId } = await aggiornaLuogoSegnalazione(
          cittadino.pending_city_report_id,
          luogo.city,
          luogo.neighborhood,
        )

        await inviaMessaggioTelegram(
          chatId,
          clusterId
            ? messaggio('comuneUnitoAGruppo', lingua, luogo.city)
            : messaggio('comuneRegistrato', lingua, luogo.city, luogo.neighborhood),
        )
        return NextResponse.json({ ok: true })
      }

      // Non è un luogo. Se è abbastanza lungo da essere un racconto, lo
      // trattiamo come una nuova segnalazione e smettiamo di insistere: il
      // comune lo chiederemo un'altra volta. Meglio perdere un dato che
      // ignorare una persona che sta parlando.
      if (testo.length >= LUNGHEZZA_MINIMA) {
        await sb
          .from('citizens')
          .update({ pending_city_report_id: null })
          .eq('id', cittadino.id)
        // e si prosegue con il flusso normale di segnalazione
      } else {
        await inviaMessaggioTelegram(chatId, messaggio('comuneNonCapito', lingua))
        return NextResponse.json({ ok: true })
      }
    }

    // Il controllo di lunghezza sta QUI e non prima: una risposta come
    // «Milano» è di sei caratteri, e messo più in alto rifiutava proprio le
    // risposte alla domanda che avevamo appena fatto noi.
    // Anche qui il guasto salta il controllo: il segnaposto non va giudicato
    // come se fosse il messaggio di una persona.
    if (!guasto && testo.length < LUNGHEZZA_MINIMA) {
      await inviaMessaggioTelegram(chatId, messaggio('troppoBreve', lingua))
      return NextResponse.json({ ok: true })
    }

    // --- Limite anti abuso -------------------------------------------------
    if (!limiteGiaVerificato) {
      const limite = await checkReportRateLimit(cittadino.id, 'telegram')
      if (!limite.allowed) {
        await inviaMessaggioTelegram(
          chatId,
          messaggio('troppeSegnalazioni', lingua, Math.ceil(limite.retryAfterSeconds / 60)),
        )
        return NextResponse.json({ ok: true })
      }
    }

    // --- Segnalazione ------------------------------------------------------
    // external_id = update_id: Telegram rinvia lo stesso update se non rispondiamo
    // in tempo, e il vincolo unique(channel, external_id) impedisce il doppione.
    const { data: report, error: erroreReport } = await sb
      .from('reports')
      .insert({
        citizen_id: cittadino.id,
        channel: 'telegram',
        external_id: String(update.update_id),
        raw_text: testo,
        // Su guasto la riga nasce già archiviata: tiene al sicuro il file e il
        // momento, ma non entra nel flusso civico. 'nuovo' la farebbe ripescare
        // dal cron di recupero, che triagerebbe il segnaposto e lo porterebbe
        // verso un gruppo — cioè un atto costruito su una riga che nessuno ha
        // mai scritto.
        status: guasto ? 'archiviato' : 'nuovo',
      })
      .select('id, public_token')
      .single()

    if (erroreReport) {
      // 23505 = violazione di unique: è un rinvio dello stesso update.
      // Va confermato con 200, altrimenti Telegram riprova all'infinito.
      if (erroreReport.code === '23505') {
        logger.info('telegram.update_duplicato', { update_id: update.update_id })
        return NextResponse.json({ ok: true })
      }
      throw new Error(`insert segnalazione fallito: ${erroreReport.message}`)
    }

    logger.info('telegram.segnalazione_ricevuta', {
      report_id: report.id,
      citizen_id: cittadino.id,
      tipo: media?.kind ?? 'testo',
      guasto,
    })

    // --- Risposta immediata al cittadino -----------------------------------
    const urlSegnalazione = `${serverEnv.APP_URL}/segnalazione/${report.public_token}`

    if (guasto) {
      // Il guasto è nostro e si dice così: senza accusare chi ha parlato e
      // senza promettere che ci riproveremo — oggi nessun cron sa ritrascrivere
      // un audio già archiviato, e prometterlo sarebbe una bugia.
      // Non si manda nemmeno il link: quella pagina non ha niente da mostrare.
      await inviaMessaggioTelegram(
        chatId,
        messaggio(guasto === 'audio' ? 'vocaleNonAscoltato' : 'fotoNonLetta', lingua),
      )
    } else if (media?.kind === 'audio' && media.trascrizione) {
      // Si rimanda indietro quello che abbiamo capito: una trascrizione
      // sbagliata che nessuno controlla diventa una segnalazione sbagliata
      // dentro un gruppo, e forse dentro un atto.
      await inviaMessaggioTelegram(
        chatId,
        messaggio('ricevutaVocale', lingua, anteprimaDi(media.trascrizione), urlSegnalazione),
      )
    } else if (media?.kind === 'foto' && !media.descrizione) {
      // La foto non l'abbiamo letta, ma le parole scritte insieme bastavano.
      // Va detto: altrimenti la persona crede che stiamo lavorando sull'immagine.
      await inviaMessaggioTelegram(
        chatId,
        messaggio('ricevutaFotoSoloTesto', lingua, urlSegnalazione),
      )
    } else if (media?.kind === 'foto') {
      await inviaMessaggioTelegram(
        chatId,
        msgTelegram.caption?.trim()
          ? messaggio('ricevutaFoto', lingua, urlSegnalazione)
          : messaggio('ricevutaFotoSenzaTesto', lingua, urlSegnalazione),
      )
    } else {
      await inviaMessaggioTelegram(chatId, messaggio('ricevuta', lingua, urlSegnalazione))
    }

    // --- Lavoro pesante dopo la risposta HTTP ------------------------------
    const mediaDaArchiviare = media
    const guastoDaArchiviare = guasto
    after(async () => {
      // L'allegato va nel bucket privato prima del triage: se il triage esplode,
      // il file è comunque al sicuro e collegato alla segnalazione. Al contrario
      // resterebbe un file orfano nel bucket, invisibile anche alla cancellazione
      // dell'account.
      if (mediaDaArchiviare) {
        try {
          await archiviaMedia({ ...mediaDaArchiviare, reportId: report.id })
        } catch (errore) {
          logger.error('telegram.archiviazione_media_fallita', {
            report_id: report.id,
            kind: mediaDaArchiviare.kind,
            error: errore,
          })
        }
      }

      // Niente triage sul segnaposto: non c'è testo da classificare, e farlo
      // significherebbe pagare un modello per giudicare una frase scritta da noi.
      // La riga resta 'archiviato' con il suo file allegato.
      if (guastoDaArchiviare) {
        logger.warn('telegram.triage_saltato_per_guasto', {
          report_id: report.id,
          tipo: guastoDaArchiviare,
        })
        return
      }

      try {
        const esito = await triageReport(report.id)

        // Da qui in poi si risponde nella lingua in cui il cittadino ha
        // davvero scritto, non in quella della sua applicazione.
        // La memoria di questa scelta (`citizens.preferred_language`) la scrive
        // il triage: qui si usa e basta, per non avere due padroni sulla stessa
        // colonna.
        const linguaEsito = normalizzaLingua(esito.language || lingua)

        // Quarantena (PLAN2 §1.3): onestà senza accusa. La segnalazione non è
        // stata cancellata e non prosegue: lo si dice, senza fare la lezione e
        // senza nominare il motivo. Un falso positivo su una parolaccia non
        // deve trasformarsi in un richiamo.
        if (esito.quarantined) {
          await inviaMessaggioTelegram(chatId, messaggio('inQuarantena', linguaEsito))
          return
        }

        // Il modello ha giudicato il messaggio troppo vago per farci qualcosa,
        // e la segnalazione è stata archiviata. Il cittadino però ha appena
        // letto «la sto confrontando con quelle di altri»: se non gli diciamo
        // niente, resta convinto che stiamo lavorando su una cosa che invece è
        // ferma. Glielo diciamo, e gli mostriamo come riscriverla — se il triage
        // sa quale sia la cosa che manca, gliela chiediamo per nome.
        if (!esito.actionable) {
          await inviaMessaggioTelegram(
            chatId,
            esito.missingDetail
              ? messaggio('domandaSpecifica', linguaEsito, esito.missingDetail)
              : messaggio('servonoDettagli', linguaEsito),
          )
          return
        }

        // Il comune non è né nel testo né fra ciò che sappiamo del cittadino:
        // senza, questa segnalazione non potrà mai unirsi a quelle dei vicini.
        // Si chiede adesso, una volta sola, e la risposta arriverà al prossimo
        // messaggio (vedi pending_city_report_id). Ha la precedenza su ogni
        // altra domanda: due domande insieme non ricevono risposta.
        if (esito.needsCity) {
          await sb
            .from('citizens')
            .update({ pending_city_report_id: report.id })
            .eq('id', cittadino.id)

          await inviaMessaggioTelegram(chatId, messaggio('chiediComune', linguaEsito))
          return
        }

        // La segnalazione va bene così, ma una cosa la renderebbe più forte
        // (PLAN2 §2.4). Si chiede quella, non «più dettagli».
        if (esito.missingDetail) {
          await inviaMessaggioTelegram(
            chatId,
            messaggio('dettaglioInPiu', linguaEsito, esito.missingDetail),
          )
        }
      } catch (errore) {
        // Non si rilancia: la segnalazione è salva e il cron la riprenderà.
        logger.error('telegram.triage_fallito', {
          report_id: report.id,
          error: errore,
        })
      }
    })

    return NextResponse.json({ ok: true })
  } catch (errore) {
    logger.error('telegram.webhook_errore', {
      update_id: update.update_id,
      error: errore,
    })

    await inviaMessaggioTelegram(chatId, messaggio('errore', lingua))

    // 200, NON 500 — e la ragione è costata a un cittadino vero una raffica di
    // messaggi identici.
    //
    // Qui c'era un 500, con la buona intenzione di dare alla segnalazione una
    // seconda occasione: Telegram rinvia l'update finché il webhook non
    // risponde 2xx. Ma se il guasto è DETERMINISTICO — una chiave sbagliata,
    // una migrazione non applicata, un bucket che non esiste — il tentativo
    // successivo fallisce esattamente come il primo. E siccome poche righe più
    // su avevamo già scritto alla persona, ogni rinvio le rimandava lo stesso
    // «qualcosa non ha funzionato». Un ciclo infinito, addosso a chi si stava
    // fidando: non un fastidio, il modo più rapido di farsi bloccare il bot.
    //
    // La regola generale: **se abbiamo già risposto al cittadino, l'update è
    // consumato**. Rispondere 500 dopo aver scritto significa chiedere a
    // Telegram di far ripetere il messaggio a noi e alla persona.
    // Il 500 resta legittimo solo nei rami che falliscono PRIMA di aver detto
    // qualcosa: lì il rinvio è silenzioso e utile.
    //
    // La rete per non perdere la segnalazione non è il rinvio di Telegram: è
    // `/api/cron/rescue-reports`, che ripesca ciò che è rimasto in `nuovo`. Se
    // il guasto capita prima ancora dell'insert, la segnalazione è persa
    // comunque — e il rinvio non l'avrebbe salvata, perché avrebbe rifallito.
    return NextResponse.json({ ok: true })
  }
}

// --- Tipi minimi dell'API Telegram -----------------------------------------
// Solo i campi che usiamo davvero: importare un pacchetto di tipi completo per
// una decina di proprietà non vale la dipendenza.
interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  edited_message?: TelegramMessage
}

interface TelegramMessage {
  message_id: number
  from?: {
    id: number
    is_bot: boolean
    first_name?: string
    username?: string
    /** Lingua dell'applicazione di chi scrive, es. `it`, `ro`, `ar`. */
    language_code?: string
  }
  chat?: { id: number }
  text?: string
  /** Testo che accompagna una foto: spesso è lì che sta il racconto. */
  caption?: string
  date: number
  voice?: TelegramFileAudio
  audio?: TelegramFileAudio
  /** Stessa immagine in più dimensioni, dalla più piccola alla più grande. */
  photo?: { file_id: string; file_unique_id: string; width: number; height: number }[]
  location?: { latitude: number; longitude: number }
}

interface TelegramFileAudio {
  file_id: string
  file_unique_id: string
  duration?: number
  mime_type?: string
  file_size?: number
}
