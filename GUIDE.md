# GUIDE — Cosa devi fare tu a mano

Il codice di VOCE è nel repo. Questa guida elenca **solo le cose che un agente non può
fare al posto tuo**: creare account, ottenere chiavi, cliccare in console di terze
parti, prendere decisioni legali e parlare con persone reali.

Tempo stimato per arrivare a un'istanza funzionante: **90 minuti**.
Tempo per arrivare al pilot su cittadini veri: qualche giorno, per i motivi legali
spiegati al passo 10 — che sono la parte seria di questo documento.

Legenda: 🔑 serve una chiave · 🖱️ serve un clic in una console · ⚖️ serve una decisione
tua (legale/etica) · ⏱️ quanto ci vuole

---

## Prerequisiti

| Cosa           | Verifica             | Se manca                                         |
| -------------- | -------------------- | ------------------------------------------------ |
| Node 22+       | `node -v`            | <https://nodejs.org> o `nvm install 22`          |
| pnpm 9+        | `pnpm -v`            | `npm i -g pnpm`                                  |
| Docker Desktop | `docker info`        | serve **solo** per Supabase in locale (passo 2b) |
| Supabase CLI   | `supabase --version` | `brew install supabase/tap/supabase`             |
| Vercel CLI     | `vercel --version`   | `npm i -g vercel`                                |
| gh CLI         | `gh --version`       | `brew install gh` (opzionale)                    |

Le dipendenze del progetto sono già installate. Se parti da un clone pulito:

```bash
pnpm install
```

---

## Passo 0 · Genera i segreti interni ⏱️ 1 min

Due segreti li generi tu, non te li dà nessun servizio:

```bash
echo "INTERNAL_KEY=$(openssl rand -hex 32)"
echo "CRON_SECRET=$(openssl rand -hex 32)"
echo "TELEGRAM_WEBHOOK_SECRET=$(openssl rand -hex 32)"
echo "IP_HASH_SALT=$(openssl rand -hex 32)"
```

Tienili da parte: servono sia in `.env.local` sia su Vercel.
`TELEGRAM_WEBHOOK_SECRET` è quello che impedisce a chiunque conosca l'URL del webhook
di iniettare segnalazioni false nel tuo database.

---

## Passo 1 · Supabase 🔑🖱️ ⏱️ 15 min

### 1a. Progetto cloud (consigliato: è quello che poi userà Vercel)

1. <https://supabase.com/dashboard> → **New project**
2. Region: **Frankfurt (eu-central-1)** — dati di cittadini italiani, restano in UE.
3. Salva la password del database in un gestore di password: **non è recuperabile**.
4. Da **Project Settings → API** copia:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY` ⚠️ **mai** nel browser, mai nel repo,
     mai in una variabile che inizia per `NEXT_PUBLIC_`.

### 1b. Collega il repo al progetto

```bash
supabase login
supabase link --project-ref <project-ref>   # lo trovi nell'URL del dashboard
```

### 1c. Applica lo schema

```bash
supabase db push          # applica supabase/migrations/* al progetto cloud
```

In locale, se preferisci sviluppare offline (serve Docker):

```bash
supabase start            # la prima volta scarica ~1GB di immagini
supabase db reset         # applica le migration da zero
```

`supabase start` stampa URL e chiavi locali: usali in `.env.local` mentre sviluppi.

### 1d. Verifica che le estensioni siano attive

Dashboard → **Database → Extensions**, oppure:

```bash
supabase db execute --sql "select extname from pg_extension order by 1;"
```

Devono comparire `vector` (embedding) e `postgis` (geolocalizzazione). Sono create
dalle migration; se una fallisce, abilitala a mano dal dashboard e ri-esegui.

### 1e. Storage per foto e PDF

Dashboard → **Storage** → crea due bucket:

| Bucket    | Visibilità  | Perché                                                            |
| --------- | ----------- | ----------------------------------------------------------------- |
| `media`   | **privato** | foto allegate dai cittadini: possono contenere volti e targhe     |
| `dossier` | pubblico    | i PDF degli atti sono il prodotto civico, devono essere linkabili |

### 1f. Auth

Dashboard → **Authentication → Providers**:

- **Email** attivo, con "Confirm email" **OTP** anziché magic link (l'OTP funziona
  meglio da mobile, dove sta il tuo utente).
- **Phone** attivo solo quando avrai configurato Twilio (passo 4).

**Authentication → URL Configuration** → `Site URL` = il tuo dominio di produzione
(o `http://localhost:3000` finché sei in locale).

---

## Passo 2 · OpenAI 🔑 ⏱️ 5 min

1. <https://platform.openai.com/api-keys> → **Create new secret key**.
   Chiamala `voce-mvp`: una chiave dedicata al progetto, così puoi revocarla senza
   toccare altro.
2. → `OPENAI_API_KEY`
3. **Fai questo, non saltarlo**: <https://platform.openai.com/settings/organization/limits>
   → imposta un **budget mensile di 20 €** e un alert a 10 €.
   Il budget stimato dell'MVP è ~15 €; un bug in un ciclo di embedding può bruciarne
   cento in una notte senza che tu te ne accorga.

---

## Passo 3 · Bot Telegram 🔑🖱️ ⏱️ 10 min

Telegram è il canale principale: gratuito, senza approvazioni, funziona subito.

1. Su Telegram apri **@BotFather** → `/newbot`
2. Nome visibile: `VOCE` · username: qualcosa che finisce per `bot`
   (es. `try_voce_bot`, se libero)
3. Copia il token → `TELEGRAM_BOT_TOKEN`
4. Sempre in BotFather, rifinisci il bot:
   - `/setdescription` → _"Racconta un problema del tuo quartiere. Se non sei da solo,
     VOCE lo trasforma in un'azione collettiva."_
   - `/setabouttext` → una riga con il link al repo
   - `/setuserpic` → il logo
   - `/setprivacy` → **Enable** (il bot legge solo i messaggi diretti: è il default
     corretto per la privacy)

5. **Registra il webhook** — da fare _dopo_ il primo deploy (passo 6), perché serve un
   URL pubblico in HTTPS:

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H 'content-type: application/json' \
  -d "{\"url\":\"$APP_URL/api/ingest/telegram\",\"secret_token\":\"$TELEGRAM_WEBHOOK_SECRET\"}"
```

Verifica:

```bash
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo" | jq
```

`pending_update_count` alto o `last_error_message` valorizzato = il tuo endpoint sta
rifiutando gli update. Guarda i log su Vercel.

> Il `secret_token` non è opzionale: senza, chiunque scopra l'URL può inserire
> segnalazioni false e inquinare i cluster su cui costruirai un esposto.

---

## Passo 4 · WhatsApp via Twilio 🔑🖱️ ⏱️ 15 min

WhatsApp è il canale che raggiunge chi non usa Telegram — cioè la maggioranza degli
over 50 in Italia. In MVP si usa la **Sandbox**, gratuita.

1. Registrati su <https://www.twilio.com/try-twilio> (verifica via SMS).
2. Console → **Account Info**: copia `Account SID` → `TWILIO_ACCOUNT_SID` e
   `Auth Token` → `TWILIO_AUTH_TOKEN`.
3. **Messaging → Try it out → Send a WhatsApp message**: attiva la Sandbox.
   Ti dà un numero (tipo `+1 415 523 8886`) → `TWILIO_WHATSAPP_NUMBER`
   nel formato `whatsapp:+14155238886`.
4. Nella stessa pagina, tab **Sandbox settings**:
   - _When a message comes in_ → `https://<tuo-dominio>/api/ingest/whatsapp` · `POST`
5. Ogni tester deve mandare **una volta** il codice di join (tipo `join <due-parole>`)
   al numero della sandbox, e ripeterlo **ogni 72 ore**. È il limite della sandbox:
   mettilo in conto per la demo e avvisa i tester la mattina stessa.

**OTP via SMS** (serve per la firma degli atti): Supabase → Authentication → Providers
→ Phone → provider **Twilio**, incolla SID e Auth Token, e imposta un
Messaging Service. Costa ~0,03 €/SMS: con 1000 firme sono ~30 €.
Finché sei in demo, l'OTP via email è gratis e sufficiente.

---

## Passo 5 · Ambiente locale ⏱️ 5 min

Crea `apps/web/.env.local` (è già in `.gitignore` — **non committarlo mai**):

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
INTERNAL_KEY=
CRON_SECRET=
IP_HASH_SALT=
APP_URL=http://localhost:3000
```

Poi:

```bash
pnpm dev            # http://localhost:3000
pnpm typecheck      # deve passare pulito
pnpm seed           # dati sintetici marcati is_synthetic, per vedere l'interfaccia piena
```

Per testare i webhook in locale ti serve un tunnel pubblico:

```bash
npx untun@latest tunnel http://localhost:3000
# oppure: cloudflared tunnel --url http://localhost:3000
```

e registra quell'URL come webhook Telegram (passo 3.5), ricordando di rimetterlo a
posto quando passi in produzione.

---

## Passo 6 · Deploy su Vercel 🖱️ ⏱️ 15 min

```bash
vercel link          # collega la cartella al progetto
vercel env add NEXT_PUBLIC_SUPABASE_URL production
# ... ripeti per ogni variabile del passo 5, con APP_URL = URL di produzione
vercel --prod
```

Oppure dal dashboard: **Import Git Repository** → seleziona il repo.
Impostazioni importanti:

| Impostazione    | Valore                        |
| --------------- | ----------------------------- |
| Framework       | Next.js (rilevato)            |
| Root Directory  | `apps/web`                    |
| Build Command   | lascia il default             |
| Region          | `fra1` (già in `vercel.json`) |
| Node.js Version | 22.x                          |

### I cron e il piano Hobby — leggi prima di deployare

⚠️ Su **Hobby**, una pianificazione più frequente di una volta al giorno **fa fallire
il deploy**. Non viene declassata: il build si interrompe con
_"Hobby accounts are limited to daily cron jobs"_. Le pianificazioni di `PLAN.md` §8
(`*/15 * * * *`) romperebbero il tuo primo deploy.

Per questo `apps/web/vercel.json` ha pianificazioni **giornaliere**, e la frequenza
vera la dà `.github/workflows/cron.yml` — GitHub Actions, gratuito sui repo pubblici,
ogni 15 minuti. Devi solo aggiungere due segreti al repo
(**Settings → Secrets and variables → Actions**):

| Segreto       | Valore                                              |
| ------------- | --------------------------------------------------- |
| `APP_URL`     | l'URL di produzione, senza slash finale             |
| `CRON_SECRET` | lo stesso valore che hai messo tra le env di Vercel |

Se passi a **Vercel Pro** (20 $/mese): cancella il workflow e riporta in `vercel.json`
`*/15 * * * *` per `recluster` e `*/10 * * * *` per `rescue-reports`.

Durante la demo puoi sempre forzare un giro a mano:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/recluster"
```

Dopo il deploy, torna al **passo 3.5** e registra il webhook Telegram sull'URL vero.

---

## Passo 7 · Verifica che funzioni davvero ⏱️ 10 min

Non fidarti del fatto che il deploy sia verde. Fai questi sette controlli:

1. **Home** raggiungibile, tricolore e header istituzionale visibili.
2. **Telegram**: manda un messaggio vero al bot. Deve rispondere entro ~2 secondi.
   In Supabase → Table Editor → `reports` deve comparire una riga.
3. **Triage**: dopo qualche secondo la stessa riga deve avere `category`, `urgency`,
   `anon_text` valorizzati e `status` diverso da `nuovo`.
   Se resta `nuovo`: chiave OpenAI, budget esaurito, o errore nei log Vercel.
4. **Cluster**: manda 5 segnalazioni simili da 5 account diversi (o esegui `pnpm seed`),
   poi lancia il cron di recluster a mano. Deve nascere un gruppo.
5. **Atti**: al superamento della soglia (5 cittadini distinti) devono comparire le
   bozze in `actions`, tutte con `status='bozza'`.
6. **Firma**: accedi, firma un atto, verifica che il contatore salga e che la **seconda**
   firma dello stesso utente venga rifiutata.
7. **Isolamento (il più importante)**: con due account diversi, prova a leggere le
   segnalazioni dell'altro via API. Devi ottenere zero righe. Se ne ottieni una, ferma
   tutto: la RLS non funziona e non puoi far entrare cittadini veri.

---

## Passo 8 · Scegli il quartiere pilota ⚖️ ⏱️ decisione tua

`PLAN.md` §13 propone Corvetto (Milano), Sanità (Napoli), Ballarò (Palermo) e
raccomanda Corvetto per l'MVP. È una scelta che devi fare tu entro il giorno 2, perché
condiziona i contatti PA da caricare e le categorie locali.

Una volta scelto, servono da te:

1. **Contatti PA reali** in `pa_endpoints`: sindaco/assessore, responsabile della
   trasparenza, difensore civico, procura competente. Fonti ufficiali:
   <https://www.indicepa.gov.it> e il sito del comune. Verifica ogni PEC **una per una**:
   un indirizzo sbagliato manda un atto nel vuoto o alla persona sbagliata.
2. **Un referente umano** sul territorio (associazione, parrocchia, centro sociale,
   biblioteca). VOCE senza un ancoraggio locale raccoglie dieci segnalazioni e muore.
3. **5-10 tester reali** per il bug bash del giorno 13.

---

## Passo 9 · Prima di far entrare cittadini veri ⚖️ — leggi questo

Qui non posso decidere al posto tuo, e il piano sottovaluta il problema.

### La base giuridica va verificata da un legale

`PLAN.md` §11 indica l'art. 6(1)(e) GDPR — _interesse pubblico_. Quella base è pensata
per soggetti che esercitano pubblici poteri o svolgono un compito di interesse pubblico
**previsto dalla legge**. VOCE, come progetto privato, difficilmente ci rientra:
la base realistica per il pilot è il **consenso** (art. 6(1)(a)), esplicito e
revocabile. Non è un dettaglio formale: sbagliare base giuridica rende illecito
l'intero trattamento.

### Stai raccogliendo dati particolari senza dirlo

Una segnalazione su un pronto soccorso è un **dato sanitario** (art. 9 GDPR).
Una su un centro di accoglienza può rivelare lo status migratorio. Una su una scuola
riguarda minori. `PLAN.md` non lo affronta. Prima del pilot decidi, e scrivi:
o raccogli il **consenso esplicito** per queste categorie, o le escludi dal trattamento
automatico e le tieni fuori dalle pagine pubbliche.

### Documenti che devono esistere prima della prima segnalazione reale

- **DPIA** (valutazione d'impatto): obbligatoria, qui — trattamento su larga scala,
  categorie particolari, profilazione geografica.
- **Informativa privacy** raggiungibile _prima_ dell'invio, **su tutti i canali**
  (anche via bot, come primo messaggio).
- **Registro dei trattamenti**.
- **Tempi di conservazione** dichiarati **e implementati**: una retention scritta e mai
  eseguita è peggio di nessuna retention.

### Il rischio che riguarda le persone, non i dati

Chi firma un esposto può essere identificato. In alcuni dei quartieri candidati questo
non è un rischio astratto. Prima di aprire le firme in un territorio, chiediti se una
persona che firma può subirne conseguenze — e se la risposta non è un no tranquillo,
tieni le firme aggregate e anonime.

### Revisione umana degli atti

Nessun atto generato deve partire senza che una persona l'abbia letto e firmato con
nome e cognome. Il codice lo impone (`status='bozza'`); tu non aggirarlo per fare
prima in demo.

---

## Passo 10 · Consegna hackathon ⏱️ giorno 14

- [ ] Repo pubblico AGPL-3.0 con README che porta a un setup locale in <10 minuti
- [ ] Deploy live raggiungibile
- [ ] Bot Telegram attivo e risponde
- [ ] Almeno un cluster reale da 5+ persone diverse
- [ ] Almeno una bozza di esposto visibile pubblicamente
- [ ] Video demo di 3 minuti: segnalazione → cluster → dossier → firma
- [ ] Documentazione: come replicare in un altro comune

Per il video: registra il flusso **dal telefono**, non dal browser desktop. VOCE è un
prodotto che vive su WhatsApp e Telegram: mostrarlo come una web app ne tradisce l'idea.

---

## Cambiare una soglia ⚖️

Nessuna soglia è scritta a mano nel codice: si cambiano tutte da Vercel, senza
ricompilare. L'elenco completo con i valori predefiniti è in `.env.example`.

Le più utili durante il pilot:

| Variabile | Predefinito | Quando toccarla |
|---|---|---|
| `SIMILARITY_NEW` | 0.60 | non nasce nessun gruppo → abbassa a 0.55 |
| `MIN_REPORTS_NEW_CLUSTER` | 5 | poche segnalazioni in tutto → abbassa a 3 |
| `ACTION_THRESHOLD_CITIZENS` | 5 | serve un atto per la demo → abbassa |
| `RATE_LIMIT_REPORTS_PER_HOUR` | 5 | i tester sbattono contro il limite |

L'applicazione controlla che le soglie siano coerenti **fra loro** e si rifiuta di
partire se la combinazione non ha senso (per esempio `SIMILARITY_NEW` sotto
`SIMILARITY_ASSIGN`, che farebbe nascere gruppi doppioni sullo stesso problema).

### Le due soglie di privacy sono diverse

`MIN_PUBLIC_CITIZENS` e `GEO_BLUR_METERS` vivono **anche nel database**, nella
tabella `app_config`, ed è il database a filtrare davvero le viste pubbliche e la
policy RLS. Cambiare solo la variabile su Vercel **non cambia la privacy**:
cambia solo ciò che l'applicazione crede.

Per cambiarle davvero servono entrambi i lati:

```sql
-- 1. nel database (Supabase → SQL Editor)
update app_config set value_int = 4 where key = 'min_public_citizens';
```

```bash
# 2. su Vercel, stessa cifra
MIN_PUBLIC_CITIZENS=4
```

Poi verifica che i due lati siano d'accordo:

```bash
curl -s https://<tuo-dominio>/api/health | jq '.soglie, .problemiSoglie'
# "ok"  → allineati
# "incoerenti" → dice quale valore usa l'app e quale applica il database
```

`/api/health` risponde **503** finché divergono: è voluto, perché una soglia di
privacy che l'applicazione crede diversa da quella reale non si nota da nessuna
parte finché non espone qualcuno.

Abbassare `MIN_PUBLIC_CITIZENS` sotto 2 è impedito: un gruppo pubblico
coinciderebbe con una sola persona, che verrebbe così identificata.

---

## Problemi frequenti

| Sintomo                            | Causa quasi sempre                               | Rimedio                                 |
| ---------------------------------- | ------------------------------------------------ | --------------------------------------- |
| Il bot non risponde                | webhook non registrato o secret token diverso    | `getWebhookInfo` e ri-registra          |
| `reports` resta a `status='nuovo'` | `OPENAI_API_KEY` assente/budget esaurito         | log Vercel della route di triage        |
| Nessun cluster nasce               | pochi report simili, o soglia troppo alta        | abbassa `SIMILARITY_NEW`, o `pnpm seed` |
| Contatore firme sempre 0           | la view eredita la RLS privata di `signatures`   | usa la funzione `security definer`      |
| Utente sloggato a caso             | `setAll` mancante nel `proxy.ts`                 | vedi `apps/web/proxy.ts`                |
| `Module not found: fs`             | pacchetto Node importato in un componente client | sposta la logica sul server             |
| Build fallisce su Vercel           | Root Directory non è `apps/web`                  | correggi nelle impostazioni             |
| Twilio non consegna                | tester fuori dalla finestra di 72h               | fai rimandare il codice di join         |

---

## Costi da tenere d'occhio

| Voce           | MVP        | Dove si controlla                         |
| -------------- | ---------- | ----------------------------------------- |
| Vercel Hobby   | 0 €        | cron limitati a 1/giorno                  |
| Supabase Free  | 0 €        | 500 MB DB, si esaurisce con gli embedding |
| OpenAI         | ~15 €      | **imposta il budget al passo 2**          |
| Twilio Sandbox | 0 €        | SMS OTP a parte (~0,03 €/msg)             |
| Dominio        | ~12 €/anno | opzionale                                 |

L'embedding è la voce che cresce in silenzio: 1536 dimensioni × 4 byte × N report.
Con 10.000 segnalazioni sono ~60 MB solo di vettori, più gli indici.
