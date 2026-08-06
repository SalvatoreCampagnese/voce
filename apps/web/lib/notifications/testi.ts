/**
 * I testi degli avvisi ai cittadini.
 *
 * Sono l'unica cosa che una persona vede di tutto questo sottosistema: se sono
 * scritti male, il lavoro sotto non conta niente.
 *
 * REGOLE DI SCRITTURA (Designers Italia / voce-copywriter-it)
 * - dai del tu;
 * - massimo 15 parole per frase;
 * - zero anglicismi (si scrive segnalazione, gruppo, atto, amministrazione);
 * - nessuna emoji;
 * - **nessuna promessa che il sistema non mantiene**.
 *
 * L'ultimo punto è il motivo per cui questo file esiste. Il bot ha promesso a
 * tutti «ti scrivo appena diventa parte di un'azione collettiva» e nessuno
 * scriveva. Non si ripete l'errore al contrario: qui non si dice mai «lo
 * mandiamo al Comune», perché nessun atto parte finché una persona non lo ha
 * revisionato, e non si annuncia niente che il codice non sia in grado di
 * verificare.
 *
 * Ogni messaggio finisce con una riga di servizio sugli avvisi. Deve indicare
 * un'uscita **vera oggi**, e per un po' non lo ha fatto: diceva «rispondi
 * "basta" a questo messaggio» su posta e WhatsApp. Non esiste alcuna casella
 * in entrata — `lib/channels/email.ts` spedisce e basta — e in `app/api/`
 * nessuna riga legge «basta». Chi rispondeva continuava a ricevere avvisi e si
 * convinceva che lo stessimo ignorando: peggio di non offrire alcuna uscita.
 *
 * Quello che resta è quello che funziona davvero:
 *   - **Telegram**: bloccare il contatto ferma i messaggi, non dipende da noi
 *     ed è verificabile — la coda registra il fallimento, quindi la riga
 *     risulta non consegnata invece che spedita;
 *   - **posta**: nessuna disiscrizione, perché non c'è nulla da disiscrivere.
 *     Si dice il vero: gli avvisi riguardano solo la propria segnalazione e
 *     finiscono con essa. Il giorno in cui esisterà una casella presidiata si
 *     potrà offrire di più.
 *   - **whatsapp**: nessuna riga. Quel canale non spedisce niente (le notifiche
 *     nascono già fallite, vedi `lib/notifications/index.ts`), quindi qualunque
 *     istruzione sarebbe rivolta a nessuno.
 * Non si rimanda a una pagina di preferenze che non esiste.
 *
 * LINGUE
 * Ci sono le versioni italiana, inglese, francese, spagnola e rumena. Per ogni
 * altra lingua si usa l'italiano: un messaggio corretto in una lingua che il
 * destinatario capisce a metà è meglio di una traduzione approssimativa che
 * sembra una truffa.
 */

import type { Database } from '@voce/db'

/**
 * I due esiti della moderazione umana, aggiunti all'enum SQL dalla migrazione
 * `20260806000011_notifica_moderazione.sql`.
 *
 * Sono scritti a mano invece di arrivare da `Database['public']['Enums']`
 * perché i tipi generati (`packages/db/src/types.ts`) sono di un altro
 * proprietario e vanno rigenerati dopo la migrazione. L'unione qui sotto rende
 * il codice corretto in tutti e due i momenti: finché i tipi sono vecchi
 * allarga il tipo, quando saranno rigenerati diventa una unione con sé stessa e
 * non cambia niente. Nessun `as` sparso nei chiamanti in attesa di un file
 * altrui.
 */
type TipoAvvisoModerazione = 'moderazione_riammessa' | 'moderazione_confermata'

/** Tipi di avviso: rispecchia l'enum SQL `notification_kind`. */
export type TipoAvviso =
  | Database['public']['Enums']['notification_kind']
  | TipoAvvisoModerazione

/** Canali: rispecchia l'enum SQL `notification_channel`. */
export type CanaleAvviso = Database['public']['Enums']['notification_channel']

/**
 * Tutto ciò che serve a comporre un messaggio.
 *
 * I collegamenti arrivano già costruiti dal chiamante: il token pubblico di una
 * segnalazione non può stare in `notifications.payload` (lo vieta un vincolo di
 * database), quindi si risolve al momento dell'invio e si passa di qui.
 */
export interface ContestoMessaggio {
  tipo: TipoAvviso
  canale: CanaleAvviso
  /** `citizens.preferred_language`, ISO 639-1. Null vale italiano. */
  lingua: string | null
  /** Titolo del gruppo. Già pubblico, si può citare. Null se non disponibile. */
  titoloGruppo: string | null
  /** Pagina pubblica del gruppo, se il gruppo è visibile. */
  urlGruppo: string | null
  /** Pagina di stato della segnalazione del cittadino. Funziona sempre. */
  urlSegnalazione: string | null
  /** Giorni del termine di legge, per gli avvisi di scadenza. */
  giorni?: number | null
}

export interface MessaggioComposto {
  /** Riga dell'oggetto: la usa solo la posta elettronica. */
  oggetto: string
  /** Corpo in testo semplice, pronto da spedire. */
  testo: string
}

type Lingua = 'it' | 'en' | 'fr' | 'es' | 'ro'

const LINGUE_SCRITTE: readonly Lingua[] = ['it', 'en', 'fr', 'es', 'ro'] as const

interface Vocabolario {
  oggetto: Record<TipoAvviso, string>
  corpo: (ctx: ContestoMessaggio) => string[]
  /**
   * Parziale di proposito: `whatsapp` non ha voce. Quel canale non spedisce
   * niente, quindi non c'è nessuno a cui dare istruzioni.
   */
  disiscrizione: Partial<Record<CanaleAvviso, string>>
}

/**
 * Il collegamento giusto per ogni tipo di avviso.
 *
 * «Il tuo gruppo si è formato» arriva quando il gruppo può essere ancora sotto
 * la soglia di pubblicazione: la pagina `/gruppi/<id>` risponderebbe che non
 * esiste. La pagina della propria segnalazione invece funziona sempre e mostra
 * lo stato del gruppo. Per tutti gli altri avvisi il gruppo è già pubblico.
 *
 * «La quarantena è confermata» non porta da nessuna parte, ed è voluto: la
 * pagina della segnalazione non sa raccontare una segnalazione ferma in
 * moderazione e le direbbe «la stiamo confrontando». Meglio nessun
 * collegamento che un collegamento che smentisce il messaggio.
 */
function collegamento(ctx: ContestoMessaggio): string | null {
  if (ctx.tipo === 'moderazione_confermata') return null
  if (ctx.tipo === 'gruppo_formato' || ctx.tipo === 'moderazione_riammessa') {
    return ctx.urlSegnalazione ?? ctx.urlGruppo
  }
  return ctx.urlGruppo ?? ctx.urlSegnalazione
}

/** Aggiunge una riga solo se il valore c'è: niente ««null»» in un messaggio. */
function seC(valore: string | null, riga: (v: string) => string): string[] {
  return valore ? [riga(valore)] : []
}

// ---------------------------------------------------------------------------
// Italiano
// ---------------------------------------------------------------------------

const IT: Vocabolario = {
  oggetto: {
    gruppo_formato: 'VOCE — la tua segnalazione è entrata in un gruppo',
    gruppo_pubblico: 'VOCE — il tuo gruppo ora è pubblico',
    atto_preparato: 'VOCE — è pronta la bozza di un atto',
    pa_ha_risposto: 'VOCE — l\'amministrazione ha risposto',
    scadenza_meta: 'VOCE — metà del tempo per la risposta',
    scadenza_raggiunta: 'VOCE — oggi scade il termine di legge',
    scadenza_superata: 'VOCE — termine scaduto senza risposta',
    moderazione_riammessa: 'VOCE — la tua segnalazione è tornata in circolo',
    moderazione_confermata: 'VOCE — la tua segnalazione resta ferma',
  },
  corpo: (ctx) => {
    const url = collegamento(ctx)
    switch (ctx.tipo) {
      case 'gruppo_formato':
        // Si avvisa solo da due cittadini distinti in su (vedi index.ts), ma
        // «due» e «venti» qui si dicono nello stesso modo: il numero non lo
        // sappiamo al momento di comporre il testo, quindi non lo si afferma.
        // «Altri cittadini» al plurale sarebbe già falso con una sola persona.
        return [
          'La tua segnalazione non è più sola.',
          'Anche qualcun altro della tua zona ha raccontato lo stesso problema.',
          ...seC(ctx.titoloGruppo, (t) => `Ora siete un gruppo: «${t}».`),
          ...seC(url, (u) => `Segui come procede qui: ${u}`),
        ]
      case 'gruppo_pubblico':
        return [
          'Il tuo gruppo ora è visibile a tutti.',
          ...seC(ctx.titoloGruppo, (t) => `Si chiama «${t}».`),
          'Chi vive nella tua zona può vederlo e aggiungersi.',
          ...seC(url, (u) => `Lo trovi qui: ${u}`),
        ]
      case 'atto_preparato':
        return [
          'Per il tuo gruppo è pronta la bozza di un atto.',
          'Prima la legge una persona: senza revisione non parte niente.',
          'Ti scrivo se l\'amministrazione risponde.',
          ...seC(url, (u) => `Il gruppo è qui: ${u}`),
        ]
      case 'pa_ha_risposto':
        return [
          'L\'amministrazione ha risposto al tuo gruppo.',
          'Una persona ha letto e confermato la risposta.',
          ...seC(url, (u) => `La trovi qui: ${u}`),
        ]
      case 'scadenza_meta':
        return [
          'È passata metà del tempo che la legge concede per rispondere.',
          'Il tuo gruppo aspetta ancora una risposta.',
          ...seC(url, (u) => `Il gruppo è qui: ${u}`),
        ]
      case 'scadenza_raggiunta':
        return [
          'Oggi scade il termine di legge per rispondere al tuo gruppo.',
          ...seC(url, (u) => `Il gruppo è qui: ${u}`),
        ]
      case 'scadenza_superata':
        return [
          'Il termine di legge è scaduto senza risposta.',
          'Lo abbiamo segnato nella pagina del tuo gruppo.',
          ...seC(url, (u) => `Il gruppo è qui: ${u}`),
        ]
      // I due esiti della moderazione. Non si nomina il motivo del fermo, non
      // si fa la lezione: si dice com'è andata e cosa si può fare adesso.
      case 'moderazione_riammessa':
        return [
          'La tua segnalazione è stata letta ed è tornata in circolo.',
          'Ora la confronto con quelle di altri cittadini della tua zona.',
          ...seC(url, (u) => `Segui come procede qui: ${u}`),
        ]
      case 'moderazione_confermata':
        return [
          'Una persona ha letto la tua segnalazione: resta fuori dai gruppi.',
          'Puoi riscriverla con altre parole.',
        ]
    }
  },
  disiscrizione: {
    telegram: 'Non vuoi più questi avvisi? Blocca questo contatto: smetto di scriverti.',
    email: 'Questi avvisi riguardano solo la tua segnalazione e finiscono con essa.',
  },
}

// ---------------------------------------------------------------------------
// Inglese
// ---------------------------------------------------------------------------

const EN: Vocabolario = {
  oggetto: {
    gruppo_formato: 'VOCE — your report joined a group',
    gruppo_pubblico: 'VOCE — your group is now public',
    atto_preparato: 'VOCE — a draft document is ready',
    pa_ha_risposto: 'VOCE — the authority replied',
    scadenza_meta: 'VOCE — half the time for a reply has passed',
    scadenza_raggiunta: 'VOCE — the legal deadline ends today',
    scadenza_superata: 'VOCE — deadline passed with no reply',
    moderazione_riammessa: 'VOCE — your report is back in the flow',
    moderazione_confermata: 'VOCE — your report stays on hold',
  },
  corpo: (ctx) => {
    const url = collegamento(ctx)
    switch (ctx.tipo) {
      case 'gruppo_formato':
        return [
          'Your report is no longer alone.',
          'Someone else in your area reported the same problem.',
          ...seC(ctx.titoloGruppo, (t) => `You are now a group: «${t}».`),
          ...seC(url, (u) => `Follow it here: ${u}`),
        ]
      case 'gruppo_pubblico':
        return [
          'Your group is now visible to everyone.',
          ...seC(ctx.titoloGruppo, (t) => `It is called «${t}».`),
          'People in your area can see it and join.',
          ...seC(url, (u) => `You find it here: ${u}`),
        ]
      case 'atto_preparato':
        return [
          'A draft document is ready for your group.',
          'A person reads it first: nothing leaves without review.',
          'I will write to you if the authority replies.',
          ...seC(url, (u) => `Your group is here: ${u}`),
        ]
      case 'pa_ha_risposto':
        return [
          'The authority replied to your group.',
          'A person read and confirmed the reply.',
          ...seC(url, (u) => `You find it here: ${u}`),
        ]
      case 'scadenza_meta':
        return [
          'Half the time the law allows for a reply has passed.',
          'Your group is still waiting for an answer.',
          ...seC(url, (u) => `Your group is here: ${u}`),
        ]
      case 'scadenza_raggiunta':
        return [
          'The legal deadline to reply to your group ends today.',
          ...seC(url, (u) => `Your group is here: ${u}`),
        ]
      case 'scadenza_superata':
        return [
          'The legal deadline passed with no reply.',
          'We noted it on your group page.',
          ...seC(url, (u) => `Your group is here: ${u}`),
        ]
      case 'moderazione_riammessa':
        return [
          'Your report has been read and is back in the flow.',
          'I am now comparing it with reports from people in your area.',
          ...seC(url, (u) => `Follow it here: ${u}`),
        ]
      case 'moderazione_confermata':
        return [
          'A person read your report: it stays out of the groups.',
          'You can write it again with different words.',
        ]
    }
  },
  disiscrizione: {
    telegram: 'Do not want these messages? Block this contact: I stop writing.',
    email: 'These messages only concern your report and end with it.',
  },
}

// ---------------------------------------------------------------------------
// Francese
// ---------------------------------------------------------------------------

const FR: Vocabolario = {
  oggetto: {
    gruppo_formato: 'VOCE — ton signalement a rejoint un groupe',
    gruppo_pubblico: 'VOCE — ton groupe est maintenant public',
    atto_preparato: 'VOCE — un projet de document est prêt',
    pa_ha_risposto: 'VOCE — l\'administration a répondu',
    scadenza_meta: 'VOCE — la moitié du délai est passée',
    scadenza_raggiunta: 'VOCE — le délai légal se termine aujourd\'hui',
    scadenza_superata: 'VOCE — délai passé sans réponse',
    moderazione_riammessa: 'VOCE — ton signalement repart',
    moderazione_confermata: 'VOCE — ton signalement reste en attente',
  },
  corpo: (ctx) => {
    const url = collegamento(ctx)
    switch (ctx.tipo) {
      case 'gruppo_formato':
        return [
          'Ton signalement n\'est plus seul.',
          'Quelqu\'un d\'autre dans ta zone a signalé le même problème.',
          ...seC(ctx.titoloGruppo, (t) => `Vous formez maintenant un groupe : «${t}».`),
          ...seC(url, (u) => `Suis-le ici : ${u}`),
        ]
      case 'gruppo_pubblico':
        return [
          'Ton groupe est maintenant visible par tous.',
          ...seC(ctx.titoloGruppo, (t) => `Il s\'appelle «${t}».`),
          'Les habitants de ta zone peuvent le voir et le rejoindre.',
          ...seC(url, (u) => `Tu le trouves ici : ${u}`),
        ]
      case 'atto_preparato':
        return [
          'Un projet de document est prêt pour ton groupe.',
          'Une personne le lit d\'abord : rien ne part sans relecture.',
          'Je t\'écris si l\'administration répond.',
          ...seC(url, (u) => `Ton groupe est ici : ${u}`),
        ]
      case 'pa_ha_risposto':
        return [
          'L\'administration a répondu à ton groupe.',
          'Une personne a lu et confirmé la réponse.',
          ...seC(url, (u) => `Tu la trouves ici : ${u}`),
        ]
      case 'scadenza_meta':
        return [
          'La moitié du délai légal pour répondre est passée.',
          'Ton groupe attend encore une réponse.',
          ...seC(url, (u) => `Ton groupe est ici : ${u}`),
        ]
      case 'scadenza_raggiunta':
        return [
          'Le délai légal pour répondre à ton groupe se termine aujourd\'hui.',
          ...seC(url, (u) => `Ton groupe est ici : ${u}`),
        ]
      case 'scadenza_superata':
        return [
          'Le délai légal est passé sans réponse.',
          'Nous l\'avons noté sur la page de ton groupe.',
          ...seC(url, (u) => `Ton groupe est ici : ${u}`),
        ]
      case 'moderazione_riammessa':
        return [
          'Ton signalement a été lu et il repart.',
          'Je le compare maintenant avec ceux d\'autres habitants de ta zone.',
          ...seC(url, (u) => `Suis-le ici : ${u}`),
        ]
      case 'moderazione_confermata':
        return [
          'Une personne a lu ton signalement : il reste hors des groupes.',
          'Tu peux le réécrire avec d\'autres mots.',
        ]
    }
  },
  disiscrizione: {
    telegram: 'Tu ne veux plus ces messages ? Bloque ce contact : j\'arrête aussitôt.',
    email: 'Ces messages ne concernent que ton signalement et s\'arrêtent avec lui.',
  },
}

// ---------------------------------------------------------------------------
// Spagnolo
// ---------------------------------------------------------------------------

const ES: Vocabolario = {
  oggetto: {
    gruppo_formato: 'VOCE — tu aviso se ha unido a un grupo',
    gruppo_pubblico: 'VOCE — tu grupo ya es público',
    atto_preparato: 'VOCE — hay un borrador listo',
    pa_ha_risposto: 'VOCE — la administración ha respondido',
    scadenza_meta: 'VOCE — ha pasado la mitad del plazo',
    scadenza_raggiunta: 'VOCE — hoy vence el plazo legal',
    scadenza_superata: 'VOCE — plazo vencido sin respuesta',
    moderazione_riammessa: 'VOCE — tu aviso vuelve a circular',
    moderazione_confermata: 'VOCE — tu aviso sigue parado',
  },
  corpo: (ctx) => {
    const url = collegamento(ctx)
    switch (ctx.tipo) {
      case 'gruppo_formato':
        return [
          'Tu aviso ya no está solo.',
          'Alguien más de tu zona ha contado el mismo problema.',
          ...seC(ctx.titoloGruppo, (t) => `Ahora sois un grupo: «${t}».`),
          ...seC(url, (u) => `Míralo aquí: ${u}`),
        ]
      case 'gruppo_pubblico':
        return [
          'Tu grupo ya es visible para todos.',
          ...seC(ctx.titoloGruppo, (t) => `Se llama «${t}».`),
          'Quien vive en tu zona puede verlo y sumarse.',
          ...seC(url, (u) => `Lo encuentras aquí: ${u}`),
        ]
      case 'atto_preparato':
        return [
          'Hay un borrador de escrito listo para tu grupo.',
          'Antes lo lee una persona: sin revisión no sale nada.',
          'Te escribo si la administración responde.',
          ...seC(url, (u) => `Tu grupo está aquí: ${u}`),
        ]
      case 'pa_ha_risposto':
        return [
          'La administración ha respondido a tu grupo.',
          'Una persona ha leído y confirmado la respuesta.',
          ...seC(url, (u) => `La encuentras aquí: ${u}`),
        ]
      case 'scadenza_meta':
        return [
          'Ha pasado la mitad del plazo legal para responder.',
          'Tu grupo sigue esperando una respuesta.',
          ...seC(url, (u) => `Tu grupo está aquí: ${u}`),
        ]
      case 'scadenza_raggiunta':
        return [
          'Hoy vence el plazo legal para responder a tu grupo.',
          ...seC(url, (u) => `Tu grupo está aquí: ${u}`),
        ]
      case 'scadenza_superata':
        return [
          'El plazo legal ha vencido sin respuesta.',
          'Lo hemos anotado en la página de tu grupo.',
          ...seC(url, (u) => `Tu grupo está aquí: ${u}`),
        ]
      case 'moderazione_riammessa':
        return [
          'Tu aviso se ha leído y vuelve a circular.',
          'Ahora lo comparo con los de otros vecinos de tu zona.',
          ...seC(url, (u) => `Míralo aquí: ${u}`),
        ]
      case 'moderazione_confermata':
        return [
          'Una persona ha leído tu aviso: se queda fuera de los grupos.',
          'Puedes escribirlo otra vez con otras palabras.',
        ]
    }
  },
  disiscrizione: {
    telegram: '¿No quieres más avisos? Bloquea este contacto: dejo de escribirte.',
    email: 'Estos mensajes solo tratan de tu aviso y terminan con él.',
  },
}

// ---------------------------------------------------------------------------
// Rumeno
// ---------------------------------------------------------------------------

const RO: Vocabolario = {
  oggetto: {
    gruppo_formato: 'VOCE — sesizarea ta face parte dintr-un grup',
    gruppo_pubblico: 'VOCE — grupul tău este acum public',
    atto_preparato: 'VOCE — este gata un proiect de act',
    pa_ha_risposto: 'VOCE — administrația a răspuns',
    scadenza_meta: 'VOCE — a trecut jumătate din termen',
    scadenza_raggiunta: 'VOCE — astăzi expiră termenul legal',
    scadenza_superata: 'VOCE — termen expirat fără răspuns',
    moderazione_riammessa: 'VOCE — sesizarea ta a repornit',
    moderazione_confermata: 'VOCE — sesizarea ta rămâne oprită',
  },
  corpo: (ctx) => {
    const url = collegamento(ctx)
    switch (ctx.tipo) {
      case 'gruppo_formato':
        return [
          'Sesizarea ta nu mai este singură.',
          'Altcineva din zona ta a semnalat aceeași problemă.',
          ...seC(ctx.titoloGruppo, (t) => `Acum sunteți un grup: «${t}».`),
          ...seC(url, (u) => `Îl urmărești aici: ${u}`),
        ]
      case 'gruppo_pubblico':
        return [
          'Grupul tău este acum vizibil pentru toți.',
          ...seC(ctx.titoloGruppo, (t) => `Se numește «${t}».`),
          'Cine locuiește în zona ta îl poate vedea.',
          ...seC(url, (u) => `Îl găsești aici: ${u}`),
        ]
      case 'atto_preparato':
        return [
          'Pentru grupul tău este gata un proiect de act.',
          'Mai întâi îl citește o persoană: nimic nu pleacă fără verificare.',
          'Îți scriu dacă administrația răspunde.',
          ...seC(url, (u) => `Grupul tău este aici: ${u}`),
        ]
      case 'pa_ha_risposto':
        return [
          'Administrația a răspuns grupului tău.',
          'O persoană a citit și a confirmat răspunsul.',
          ...seC(url, (u) => `Îl găsești aici: ${u}`),
        ]
      case 'scadenza_meta':
        return [
          'A trecut jumătate din termenul legal pentru răspuns.',
          'Grupul tău încă așteaptă un răspuns.',
          ...seC(url, (u) => `Grupul tău este aici: ${u}`),
        ]
      case 'scadenza_raggiunta':
        return [
          'Astăzi expiră termenul legal pentru răspuns.',
          ...seC(url, (u) => `Grupul tău este aici: ${u}`),
        ]
      case 'scadenza_superata':
        return [
          'Termenul legal a expirat fără răspuns.',
          'Am notat acest lucru pe pagina grupului tău.',
          ...seC(url, (u) => `Grupul tău este aici: ${u}`),
        ]
      case 'moderazione_riammessa':
        return [
          'Sesizarea ta a fost citită și a repornit.',
          'Acum o compar cu sesizările altor locuitori din zona ta.',
          ...seC(url, (u) => `O urmărești aici: ${u}`),
        ]
      case 'moderazione_confermata':
        return [
          'O persoană a citit sesizarea ta: rămâne în afara grupurilor.',
          'O poți scrie din nou cu alte cuvinte.',
        ]
    }
  },
  disiscrizione: {
    telegram: 'Nu mai vrei aceste mesaje? Blochează acest contact: nu îți mai scriu.',
    email: 'Aceste mesaje privesc doar sesizarea ta și se termină odată cu ea.',
  },
}

const VOCABOLARI: Record<Lingua, Vocabolario> = { it: IT, en: EN, fr: FR, es: ES, ro: RO }

function scegliLingua(preferita: string | null): Lingua {
  if (!preferita) return 'it'
  // `preferred_language` può arrivare come «pt-BR» o «IT»: conta il prefisso.
  const codice = preferita.trim().toLowerCase().slice(0, 2)
  return (LINGUE_SCRITTE as readonly string[]).includes(codice) ? (codice as Lingua) : 'it'
}

/**
 * Compone il messaggio da spedire.
 *
 * Non tocca il database e non ha effetti collaterali: è testo puro, così si
 * può leggere ad alta voce prima di mandarlo a diecimila persone.
 */
export function componiMessaggio(ctx: ContestoMessaggio): MessaggioComposto {
  const vocabolario = VOCABOLARI[scegliLingua(ctx.lingua)]

  const righe = vocabolario.corpo(ctx)
  const uscita = vocabolario.disiscrizione[ctx.canale]

  return {
    oggetto: vocabolario.oggetto[ctx.tipo],
    // Riga vuota prima dell'uscita: si deve vedere che è una nota di servizio,
    // non l'ultima frase del messaggio. Se per quel canale non abbiamo niente
    // di vero da dire (whatsapp), il messaggio finisce senza nota: meglio il
    // silenzio di un'istruzione che nessuno può seguire.
    testo: (uscita ? [...righe, '', uscita] : righe).join('\n'),
  }
}

/** Lingue per cui esiste una versione scritta. Le altre ricadono sull'italiano. */
export function lingueDisponibili(): readonly string[] {
  return LINGUE_SCRITTE
}
