# VOCE — Contratto di build

**Questo documento vince su `PLAN.md` ovunque i due siano in disaccordo.**

`PLAN.md` è stato scritto prima di aprire un terminale: assume Next.js 14, Tailwind v3
e `@supabase/auth-helpers-nextjs`. Nessuna di queste cose è più vera. Qui ci sono le
decisioni già prese, verificate contro i pacchetti **realmente installati** in questo
repo. Non ri-decidere nulla di quanto segue: se ti sembra sbagliato, segnalalo nel
report finale, ma implementa quanto scritto qui — la coerenza tra agenti vale più
della preferenza del singolo.

---

## 1. Versioni installate (non modificarle, non aggiungere dipendenze)

| Pacchetto | Versione | Conseguenza operativa |
|---|---|---|
| next | **16.2.12** | App Router, Turbopack di default, `proxy.ts` al posto di `middleware.ts` |
| react / react-dom | 19.2.4 | Server Components di default |
| tailwindcss | **4.x** | **Niente `tailwind.config.ts`**: i token si dichiarano in CSS con `@theme` |
| typescript | 5.9.3 | `strict: true` ovunque |
| @supabase/supabase-js | 2.111.0 | |
| @supabase/ssr | **0.12.4** | `createServerClient` + `getAll`/`setAll`. `auth-helpers-nextjs` NON esiste nel repo |
| openai | **7.3.0** | Structured Outputs con `zodResponseFormat` da `openai/helpers/zod` |
| zod | **4.4.3** | API v4 |
| twilio | 6.0.2 | solo runtime `nodejs` |
| react-leaflet / leaflet | 5.0.0 / 1.9.4 | client-only, import dinamico |
| react-markdown | 10.1.0 | con `remark-gfm` |
| @react-pdf/renderer | 4.5.1 | runtime `nodejs` |

**Non eseguire `pnpm install` / `pnpm add`.** Le dipendenze sono già installate.
Se ti serve un pacchetto non in elenco, **non installarlo**: risolvi con quello che c'è
e segnala la mancanza nel report finale. Aggiungere una dipendenza rompe il lockfile
condiviso con gli altri agenti che stanno lavorando in parallelo.

**Non modificare** nessun `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`,
`tsconfig.json`, `next.config.ts`, `.npmrc`. Sono di proprietà dell'orchestratore.

---

## 2. Next.js 16 — le cinque cose che rompono il codice di PLAN.md

Fonte autorevole: `apps/web/node_modules/next/dist/docs/` (docs versionati, spediti col
pacchetto). Leggili lì prima di Context7 quando la domanda riguarda Next.

1. **`middleware.ts` non esiste più → si chiama `proxy.ts`** (stessa semantica, stessa
   posizione: root di `apps/web`). Export: `export function proxy(request: NextRequest)`
   più `export const config = { matcher: [...] }`.
   `runtime` non è configurabile dentro il proxy.

2. **Le Request API sono asincrone, senza più compatibilità sincrona**:
   `await cookies()`, `await headers()`, `await draftMode()`,
   `const { id } = await params`, `const q = await searchParams`.
   Accedere in modo sincrono è un errore di tipo **e** di runtime.

3. **Helper di tipo globali generati** (`next dev` / `next build` / `next typegen`) —
   usali sempre invece di scrivere a mano il tipo dei props:
   ```ts
   // page
   export default async function Page(props: PageProps<'/cluster/[id]'>) {
     const { id } = await props.params
   }
   // route handler
   export async function POST(req: NextRequest, ctx: RouteContext<'/api/actions/[id]/sign'>) {
     const { id } = await ctx.params
   }
   ```
   `PageProps`, `LayoutProps`, `RouteContext` sono globali: **non importarli**.

4. **`revalidateTag(tag)` richiede un secondo argomento** (`revalidateTag(tag, 'max')`);
   in una Server Action che deve mostrare subito il proprio effetto usa `updateTag(tag)`.

5. **Turbopack è il bundler di default**. Non aggiungere configurazione webpack:
   farebbe fallire la build.

Runtime dei Route Handler: `'nodejs'` è il default ed è quello che usiamo **ovunque**.
Non scrivere `export const runtime = 'edge'` da nessuna parte: l'SDK Twilio, `openai`
e `@react-pdf/renderer` non ci girano, e il vantaggio di latenza è irrilevante per un
webhook. `PLAN.md` §5.1 sbaglia su questo punto.

---

## 3. Tailwind v4 — i token stanno nel CSS

Non esiste `tailwind.config.ts` in questo progetto e non va creato.
La sorgente unica dei design token è **`apps/web/app/globals.css`**, dichiarati con
`@theme`. I nomi delle variabili generano automaticamente le utility
(`--color-primary-500` → `bg-primary-500`, `text-primary-500`, …).

Forma richiesta:

```css
@import 'tailwindcss';

@theme {
  --color-primary-500: #0066cc;
  --color-ink: #17324d;
  /* … */
  --font-sans: 'Titillium Web', system-ui, sans-serif;
  --text-h1: 2.25rem;
  --radius-card: 8px;
  --shadow-card: 0 2px 8px rgb(23 50 77 / 0.08);
}
```

I valori dei token (palette, tipografia, raggi, ombre) sono quelli di `PLAN.md` §3.1,
**tranne** le combinazioni che non passano il contrasto WCAG: quelle vanno corrette e
la correzione documentata in un commento accanto al token.

---

## 4. Struttura del repo e proprietà dei file

```
apps/web/                 applicazione Next.js
  app/                    App Router (pagine + route handler)
  components/             componenti specifici dell'app
  lib/                    logica non-React (supabase, ai, utils, config)
  proxy.ts                ex-middleware
  public/fonts/           Titillium Web self-hosted
packages/ui/src/          design system condiviso (@voce/ui)
packages/db/src/          tipi generati + client di seed (@voce/db)
packages/db/scripts/      script di seed
supabase/migrations/      migration SQL (convenzione CLI: NON packages/db/migrations)
supabase/functions/       Edge Function Deno (opzionale per l'MVP)
docs/                     questo file e altra documentazione
```

**Regola d'oro della parallelizzazione**: scrivi **solo** nei percorsi che il tuo
incarico ti assegna esplicitamente. Se ti serve qualcosa che appartiene a un altro
agente (un componente UI, una colonna, una utility), **assumi che esista con la firma
descritta in questo contratto** e usala; se non esiste ancora, non crearla al suo posto:
segnalala come dipendenza mancante nel report finale.

Non toccare mai: `PLAN.md`, `CLAUDE.md`, `docs/BUILD-CONTRACT.md`, `.claude/**`,
`LICENSE`, file di lock e di configurazione elencati in §1.

---

## 5. Modello dati — decisioni vincolanti

`PLAN.md` §4 contiene errori che impediscono alla migration di girare. Lo schema
corretto rispetta questi punti:

1. **Ordine di creazione**: `citizens` → `clusters` → `reports` → `report_embeddings`
   → `actions` → `signatures` → `pa_endpoints`. `reports.cluster_id` può referenziare
   `clusters` solo perché `clusters` viene prima.

2. **Identità**. `citizens` non coincide con `auth.users`:
   ```sql
   citizens.id            uuid primary key default gen_random_uuid()
   citizens.auth_user_id  uuid unique references auth.users(id) on delete set null
   ```
   Un cittadino che scrive da Telegram esiste **senza** account (`auth_user_id` null).
   Al primo accesso OTP, il record viene collegato per `phone_e164` o `email`.
   Tutte le policy RLS confrontano `auth_user_id = (select auth.uid())`,
   **mai** `id = auth.uid()`.

3. **Denormalizzazione su `reports`** (senza queste colonne la RPC di `PLAN.md` non
   compila): `city text`, `neighborhood text`, popolate all'inserimento.

4. **Testo pubblico separato**: `reports.raw_text` (privato, mai esposto) e
   `reports.anon_text` (generato dal triage, l'unico che può comparire in pagine
   pubbliche o API aperte).

5. **Idempotenza dei canali**: `reports.external_id text` +
   `unique (channel, external_id)`. Telegram (`update_id`) e Twilio (`MessageSid`)
   ritentano: senza questo vincolo si creano doppioni.

6. **Dati di test**: `reports.is_synthetic boolean not null default false`.
   Ogni view pubblica filtra `is_synthetic = false`. Non negoziabile: un atto costruito
   su segnalazioni finte è il fallimento più grave possibile per questo progetto.

7. **Geografia**: la colonna `location geography(Point,4326)` conserva la precisione
   piena. L'esposizione pubblica passa **solo** da `blur_point(location, 300)`,
   funzione SQL che arrotonda a ~300 m. Nessuna view o API espone `location`.

8. **Firme**: `unique (action_id, citizen_id)`; il conteggio pubblico passa da una
   funzione `security definer` (o da `actions.signatures_count` aggiornato da trigger),
   **non** da una view che eredita la RLS privata di `signatures` — altrimenti il
   contatore pubblico legge sempre zero.

9. **Contatori cluster**: `reports_count` e `citizens_count` (cittadini **distinti**)
   mantenuti da trigger. Attenzione al costo: niente due subquery per riga.

### Soglie operative (parametrizzate, non magic number sparsi)

Nessuna soglia è scritta a mano nel codice. Tre livelli, in quest'ordine:

| File | Ruolo |
|---|---|
| `apps/web/lib/config/constants.ts` | valori **predefiniti**, tarati su dati veri. File puro |
| `apps/web/lib/config/env.ts` | legge e valida le variabili d'ambiente |
| `apps/web/lib/config/thresholds.ts` | valori **effettivi** (`getSoglie()`) + coerenza fra soglie |

**Il codice server importa sempre da `thresholds.ts`**, mai da `constants.ts`:
importare le costanti significa ignorare in silenzio una variabile impostata su
Vercel. `getSoglie()` rifiuta l'avvio se le soglie sono incoerenti fra loro
(es. `SIMILARITY_NEW` sotto `SIMILARITY_ASSIGN`, o `MIN_PUBLIC_CITIZENS` a 1).

**Le due soglie di privacy vivono anche nel database**, nella tabella
`app_config`, ed è il database a filtrare davvero le viste pubbliche e la policy
RLS su `clusters` (via `config_int()`). Cambiare solo la variabile d'ambiente non
cambia la privacy: cambia solo ciò che l'applicazione crede.
`/api/health` confronta i due lati e risponde **503** se divergono.

Valori predefiniti:

| Costante | Valore MVP | Significato |
|---|---|---|
| `SIMILARITY_ASSIGN` | 0.55 | soglia per assegnare un report a un cluster esistente (misurata) |
| `SIMILARITY_NEW` | 0.60 | soglia per formare un cluster nuovo (misurata) |
| `MIN_REPORTS_NEW_CLUSTER` | 5 | report simili orfani necessari a creare un cluster |
| `MIN_PUBLIC_CITIZENS` | 3 | cittadini distinti prima che un cluster diventi pubblico |
| `ACTION_THRESHOLD_CITIZENS` | 5 | cittadini distinti che fanno scattare la generazione atti |
| `RATE_LIMIT_REPORTS_PER_HOUR` | 5 | per cittadino, per canale |
| `GEO_BLUR_METERS` | 300 | arrotondamento delle coordinate pubbliche |

`ACTION_THRESHOLD_CITIZENS` è **5**, non 30 come in `PLAN.md` §5.2: con 30 nessun
dossier verrebbe mai generato durante la demo di un hackathon. Il valore è
sovrascrivibile via env `ACTION_THRESHOLD_CITIZENS`.
`MIN_PUBLIC_CITIZENS` esiste per un motivo di privacy: un cluster con una sola
segnalazione in una via corta identifica chi l'ha scritta.

---

## 6. Variabili d'ambiente — nomi canonici

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET        # secret_token del webhook Telegram
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_WHATSAPP_NUMBER
INTERNAL_KEY                   # chiamate interne server→server
CRON_SECRET                    # Authorization: Bearer, sui cron Vercel
APP_URL
ACTION_THRESHOLD_CITIZENS      # opzionale, default 5
```

Accesso **solo** tramite `apps/web/lib/config/env.ts`, che valida con Zod e fallisce
all'avvio se manca qualcosa di obbligatorio. Nessun `process.env.X` sparso nel codice.
Solo `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` possono raggiungere
il browser. La service role key non compare mai fuori da `lib/supabase/service.ts`.

---

## 7. Firme condivise (assumile esistenti, non reimplementarle)

```ts
// apps/web/lib/supabase/service.ts  — service role, SOLO server, bypassa RLS
export function createServiceClient(): SupabaseClient<Database>

// apps/web/lib/supabase/server.ts   — sessione utente, Server Components e Route Handler
export async function createServerSupabase(): Promise<SupabaseClient<Database>>

// apps/web/lib/supabase/client.ts   — browser
export function createBrowserSupabase(): SupabaseClient<Database>

// apps/web/lib/ai/triage.ts
export async function triageReport(reportId: string): Promise<TriageResult>

// apps/web/lib/ai/dossier.ts
export async function generateDossier(clusterId: string): Promise<GeneratedAction[]>

// apps/web/lib/utils/geo.ts
export function blurCoordinates(lat: number, lng: number, meters?: number): { lat: number; lng: number }

// apps/web/lib/utils/hash.ts
export async function hashIp(ip: string): Promise<string>   // SHA-256 + salt da env

// apps/web/lib/security/internal.ts
export function assertInternalKey(req: Request): void       // timing-safe, lancia se invalido
export function assertCronSecret(req: Request): void
```

Il tipo `Database` viene da `@voce/db/types`. Finché non è generato, tipizza con
`Database` importato da lì comunque: chi possiede `packages/db` lo fornisce.

---

## 8. Sicurezza — requisiti minimi su ogni endpoint

- Webhook Telegram: verifica `X-Telegram-Bot-Api-Secret-Token` contro
  `TELEGRAM_WEBHOOK_SECRET` prima di qualunque scrittura.
- Webhook Twilio: verifica `X-Twilio-Signature` con `twilio.validateRequest`.
- Endpoint interni: `assertInternalKey` (confronto a tempo costante).
- Cron: `assertCronSecret` (`Authorization: Bearer ${CRON_SECRET}`).
- Ogni input esterno passa da uno schema Zod prima di toccare il database.
- Il webhook risponde **sempre** 200 rapidamente e delega il lavoro pesante; se il
  triage fallisce, il report resta salvato con `status='nuovo'` e un cron lo ripesca.
  Perdere il messaggio di un cittadino è il peggior fallimento possibile.
- Nessun `catch` silenzioso: logga sempre l'errore con `report_id`/`cluster_id`.

---

## 9. Prodotto — regole che non si negoziano

- **Interfaccia in italiano, codice in inglese.** Microcopy: dai del tu, massimo 15
  parole per frase, zero anglicismi (segnalazione, gruppo, quadro pubblico, modulo),
  nessuna emoji nell'interfaccia web.
- **Nessun atto parte senza revisione umana.** Gli atti nascono `status='bozza'`.
  Nessun percorso di codice porta a `inviata` senza azione umana tracciata.
- **Ogni output di un atto porta il disclaimer AI**, in pagina e nel PDF.
- **Accessibilità WCAG 2.1 AA**: label visibili, focus ring, target 44px, contrasto
  4.5:1, un solo `<h1>`, skip link, nessuna informazione veicolata dal solo colore.
- **Server Components di default**; `'use client'` va motivato con un commento.
- La pagina `/segnala` deve funzionare **senza JavaScript** (Server Action / form POST).

---

## 10. Definizione di "fatto"

Un incarico è finito quando:

1. I file assegnati esistono e sono completi — nessun `TODO`, nessun placeholder,
   nessuna funzione che lancia `not implemented`.
2. Il codice è coerente con le firme di §7 e con i nomi di §6.
3. `pnpm --filter @voce/web typecheck` non introduce errori **nei tuoi file**
   (puoi eseguirlo, ma non correggere file di altri agenti: segnalali).
4. Il report finale elenca: file creati, decisioni prese, dipendenze mancanti,
   e cosa resta da verificare a mano.

Non eseguire `next build`, `next dev` o `supabase start`: l'orchestratore li esegue
una volta sola alla fine, e istanze concorrenti si corrompono a vicenda.
