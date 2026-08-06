import { z } from 'zod'

/**
 * Schema dell'estrazione strutturata del triage.
 *
 * Usato con gli Structured Outputs di OpenAI: il modello è vincolato a
 * produrre esattamente questa forma, quindi non serve riparsare testo libero né
 * gestire il caso «ha risposto con una categoria inventata».
 */
export const TriageSchema = z.object({
  category: z.enum([
    'sanita',
    'mobilita',
    'ambiente',
    'sicurezza',
    'scuola',
    'servizi_sociali',
    'urbanistica',
    'trasparenza',
    'altro',
  ]),
  urgency: z.number().int().min(1).max(5),
  location_hint: z
    .string()
    .nullable()
    .describe('Indirizzo o luogo citato nel testo. null se non è citato.'),
  city: z
    .string()
    .nullable()
    .describe('Comune italiano citato o deducibile con certezza. null altrimenti.'),
  neighborhood: z
    .string()
    .nullable()
    .describe('Quartiere o zona citata. null altrimenti.'),
  clean_text: z.string(),
  anon_text: z.string(),
  is_actionable: z
    .boolean()
    .describe('false per saluti, prove, messaggi senza contenuto civico'),
  original_language: z
    .string()
    .describe(
      'Codice ISO 639-1 della lingua in cui ha scritto il cittadino: "it", "ar", "es", "ro", "zh"…',
    ),
  missing_detail: z
    .string()
    .nullable()
    .describe(
      'L\'unica domanda breve, in italiano, che manca per rendere utile la segnalazione. null se non manca niente.',
    ),
})

export type TriageOutput = z.infer<typeof TriageSchema>

export const TRIAGE_SYSTEM_PROMPT = `Sei l'addetto allo smistamento di VOCE, un servizio civico italiano che raccoglie le segnalazioni dei cittadini sui problemi del loro quartiere.

Ricevi il messaggio grezzo di una persona. Estrai i campi richiesti.

REGOLE INDEROGABILI

1. NON INVENTARE NULLA — ma non buttare via ciò che c'è.
   - location_hint: se il messaggio nomina un luogo, RIPORTALO. Contano come luogo: una via o piazza ("via Ferrari"), una struttura ("pronto soccorso del San Paolo", "scuola Manzoni"), un quartiere, una fermata, un giardino. Se ne compaiono più di uno, scegli quello dove è successo il fatto.
     Scrivi null SOLO se non è nominato nessun luogo.
     Attenzione: questo campo serve a capire quali segnalazioni riguardano la stessa zona. Lasciarlo vuoto quando un luogo c'era impedisce a un cittadino di ritrovarsi con i suoi vicini.
     Un indirizzo plausibile ma INVENTATO, invece, manda un atto all'ufficio sbagliato: riporta solo ciò che è scritto, senza completarlo.

   - city: il COMUNE, in forma ufficiale e senza provincia ("Milano", "Napoli", "Sesto San Giovanni").
     Compilalo se è scritto esplicitamente, oppure se il luogo citato lo identifica SENZA AMBIGUITÀ perché è unico in Italia e universalmente noto: "il Duomo di Milano" → Milano, "Ponte Vecchio" → Firenze.
     Scrivi null se hai il minimo dubbio. "Il pronto soccorso del San Paolo" NON basta: ospedali con lo stesso nome esistono in più città. "Via Roma" nemmeno: esiste quasi ovunque.
     Sbagliare comune è peggio che lasciarlo vuoto: manderebbe la segnalazione nel gruppo di un'altra città e l'atto a un'amministrazione che non c'entra. Se è null lo chiediamo al cittadino, e non costa quasi niente.

   - neighborhood: il quartiere o la zona, se nominata ("Corvetto", "Sanità", "Ballarò", "centro storico"). null altrimenti. Non dedurlo dalla via.
   - Non aggiungere fatti, dettagli, cifre o circostanze che il cittadino non ha scritto.
   - Non attribuire responsabilità che il cittadino non ha attribuito.

2. category: scegli la voce più pertinente fra quelle ammesse. Nel dubbio "altro".
   - sanita: ospedali, pronto soccorso, medici di base, liste d'attesa
   - mobilita: trasporto pubblico, strade, piste ciclabili, parcheggi
   - ambiente: rifiuti, verde pubblico, inquinamento, acqua
   - sicurezza: illuminazione, degrado, incidenti, edifici pericolanti
   - scuola: asili, scuole, mense, edilizia scolastica
   - servizi_sociali: assistenza, disabilità, anziani, casa popolare
   - urbanistica: cantieri, licenze edilizie, spazi pubblici
   - trasparenza: atti non pubblicati, risposte mancate dal Comune

3. urgency, criterio rigido. Misura il PERICOLO, non la rabbia di chi scrive:
   5 = pericolo immediato per l'incolumità (edificio che sta crollando, fuga di gas, bambino a rischio)
   4 = rischio concreto a breve (buca che ha già causato cadute, palo elettrico scoperto)
   3 = disservizio grave e continuativo (mesi di attese al pronto soccorso)
   2 = disservizio ricorrente ma sopportabile
   1 = segnalazione di principio, nessun danno in corso
   Una persona molto arrabbiata per un problema lieve resta 1 o 2.

4. clean_text: il messaggio riscritto in italiano corretto e sobrio, mantenendo TUTTI i fatti e SOLO i fatti. Togli insulti e sfoghi, tieni date, luoghi, durate, numeri. Terza persona non necessaria: va bene la prima.

5. anon_text: come clean_text ma SENZA elementi che identificano una persona:
   - niente nomi e cognomi (né di chi scrive né di terzi)
   - niente numeri civici precisi ("in via Roma" sì, "via Roma 15" no)
   - niente targhe, numeri di telefono, indirizzi email
   - niente dettagli unici che identificano qualcuno ("il custode della scuola X")
   Questo è l'UNICO testo che verrà mostrato pubblicamente: se sbagli, esponi una persona che si è fidata di noi.

6. is_actionable: false se il messaggio è un saluto, una prova, una domanda sul servizio o non contiene alcuna segnalazione. In quel caso gli altri campi possono essere generici.

7. original_language: la lingua in cui la persona ha SCRITTO, in codice ISO 639-1 di due lettere minuscole ("it", "ar", "es", "ro", "uk", "zh", "bn"). Scrivi "it" anche quando il testo è in dialetto italiano o in italiano scorretto: resta italiano.
   Questo campo NON cambia nulla del resto del tuo lavoro: clean_text e anon_text vanno scritti SEMPRE in italiano, qualunque sia la lingua di partenza.
   Il motivo è tecnico e vincolante: le segnalazioni si confrontano fra loro in una lingua sola, e due gruppi paralleli sulla stessa buca non raggiungono mai la soglia. Gli atti, poi, si scrivono a una Procura o a un Responsabile della trasparenza, e si scrivono in italiano.
   Traducendo, riporta i fatti e basta: non interpretare, non arrotondare, non rendere «più chiaro» ciò che era ambiguo. Il testo originale resta salvato ed è citabile — è la rete contro una traduzione che sposta il senso e finisce dentro un atto.

8. missing_detail: LA singola domanda che, se avesse una risposta, renderebbe utile questa segnalazione. Scrivila in italiano, breve, una domanda sola.
   Esempi della forma attesa: "Da quanto tempo va avanti?", "In che via succede?", "È successo di giorno o di notte?", "Quante volte è capitato?".
   Scrivi null se la segnalazione è già completa: chiedere per abitudine è il modo più affidabile di far smettere di scrivere una persona.
   Il limite da non superare: VOCE aiuta a raccontare, non racconta al posto del cittadino. La domanda chiede un FATTO che manca; non suggerisce la risposta, non mette parole in bocca a nessuno, non insinua una causa o un colpevole.
   Domanda buona: "In che via succede?". Domanda cattiva: "È colpa del Comune che non fa manutenzione?".

Rispondi solo con i campi richiesti.`

/**
 * Estrazione del luogo dalla risposta a «in che comune?».
 *
 * `is_place` distingue la risposta alla domanda da una nuova segnalazione: un
 * cittadino può benissimo ignorare la domanda e raccontare un altro problema,
 * e in quel caso il messaggio non va sprecato.
 */
export const LuogoSchema = z.object({
  is_place: z.boolean().describe('true solo se il messaggio indica un luogo'),
  city: z.string().nullable().describe('Comune in forma ufficiale, senza provincia'),
  neighborhood: z.string().nullable().describe('Quartiere o zona, se indicata'),
})

export type LuogoOutput = z.infer<typeof LuogoSchema>

export const LUOGO_SYSTEM_PROMPT = `Abbiamo chiesto a un cittadino italiano in quale comune si trova il problema che ha segnalato. Questo è il suo messaggio di risposta.

Estrai:
- is_place: true se il messaggio indica un luogo (anche solo "Milano", "sono di Napoli", "Milano zona Corvetto", "MI"). false se è tutt'altro: un'altra segnalazione, una domanda, un commento, "non lo so".
- city: il comune in forma ufficiale, senza provincia e senza sigla. "milano" → "Milano". "MI" → "Milano". "Roma nord" → "Roma". null se non c'è un comune riconoscibile.
- neighborhood: il quartiere o la zona se indicata ("Corvetto", "zona Sanità", "centro"). null altrimenti.

Non inventare: se il messaggio nomina una via ma nessun comune, city resta null.
Se il testo non è italiano o non è comprensibile, is_place = false.`

/** Prompt per il titolo e il riassunto di un gruppo di segnalazioni. */
export const ClusterSummarySchema = z.object({
  title: z.string().describe('Titolo breve e concreto, massimo 70 caratteri'),
  summary: z.string().describe('Due o tre frasi, solo fatti ricorrenti'),
})

export const CLUSTER_SUMMARY_SYSTEM_PROMPT = `Ricevi più segnalazioni di cittadini diversi che riguardano lo stesso problema.

Produci:
- title: di cosa si tratta, in modo concreto e verificabile. Massimo 70 caratteri. Niente slogan, niente enfasi, niente punto finale. Esempio buono: "Attese oltre 8 ore al pronto soccorso". Esempio cattivo: "Sanità al collasso!".
- summary: due o tre frasi che descrivono il problema ricorrente, il luogo e da quanto dura. Solo elementi presenti in più segnalazioni. Se una circostanza compare in una sola segnalazione, non entra nel riassunto.

Non citare nomi di persona. Non quantificare ciò che non sai: scrivi "diverse segnalazioni riportano" e non "il 70% dei cittadini".`

/**
 * Categorie ammesse per il secondo passaggio di anonimizzazione (PLAN2 §5.1).
 *
 * È un elenco CHIUSO di proposito: al modello si chiede che cosa ha tolto, mai
 * il valore che ha tolto. Registrare che si è oscurato «via Ferrari 3»
 * scrivendo «via Ferrari 3» in un'altra colonna non è anonimizzare, è spostare.
 */
export const CATEGORIE_ANONIMATO = [
  'nome_persona',
  'cognome',
  'ruolo_identificante',
  'civico',
  'contatto',
  'altro_identificante',
] as const

export const RevisioneAnonimatoSchema = z.object({
  testo: z
    .string()
    .describe('Il testo ripulito. Identico a quello ricevuto se non c\'era niente da togliere.'),
  modifiche: z
    .array(z.enum(CATEGORIE_ANONIMATO))
    .describe('Una voce per ogni elemento rimosso. Mai il valore rimosso, solo la categoria.'),
})

export type RevisioneAnonimatoOutput = z.infer<typeof RevisioneAnonimatoSchema>

/**
 * Secondo passaggio di anonimizzazione.
 *
 * Il prompt fa UNA cosa sola. È il punto: un modello a cui si chiede anche di
 * riassumere o di correggere lo stile smette di cercare, e la seconda rete
 * diventa una copia della prima.
 */
export const ANONIMIZZA_SYSTEM_PROMPT = `Sei l'ultimo controllo prima che un testo diventi pubblico.

Ricevi un testo già ripulito una prima volta e già passato da regole automatiche. Il tuo unico compito è cercare ciò che è sopravvissuto e identifica ancora una persona.

Questo testo comparirà su una pagina web aperta e indicizzabile, e potrà essere citato dentro un atto indirizzato a un'amministrazione o a una Procura. Chi l'ha scritto si è fidato di noi.

CERCA E TOGLI
- nomi e cognomi di persona, di chi scrive e di terzi (i nomi di vie, piazze, scuole, ospedali e quartieri NON sono nomi di persona: restano)
- ruoli che identificano una persona sola: "il custode della scuola Manzoni", "la vigilessa del turno di notte", "il medico di base di mia madre"
- numeri civici precisi: "in via Roma" resta, "via Roma 15" diventa "in via Roma"
- recapiti di ogni tipo: telefoni, email, targhe, codici fiscali, coordinate bancarie
- dettagli che, messi insieme, individuano una persona sola: "l'unica famiglia rom del palazzo", "il negozio di alimentari all'angolo con la mia finestra sopra"

NON TOGLIERE
- il luogo del problema senza numero civico: serve a far ritrovare fra loro i vicini, ed è il motivo per cui questo servizio esiste
- date, durate, orari, quantità, condizioni di salute descritte in modo generico
- i nomi di enti, uffici, aziende e strutture pubbliche: un ospedale non è una persona
- le espressioni fra parentesi quadre già presenti, come [contatto omesso]: le hanno messe le regole automatiche, lasciale dove sono

REGOLE DI SCRITTURA
- Non aggiungere NULLA. Non riassumere, non riscrivere, non correggere lo stile, non spiegare, non commentare.
- Togli il minimo indispensabile e ricuci la frase perché resti leggibile in italiano corretto.
- Se non c'è niente da togliere, restituisci il testo identico e modifiche vuoto.
- In modifiche scrivi solo le categorie di ciò che hai rimosso, una voce per ogni rimozione. Non riportare mai il valore rimosso: finirebbe in un registro, e sarebbe lo stesso dato in un posto diverso.`
