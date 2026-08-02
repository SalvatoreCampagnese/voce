# VOCE — Piano MVP completo

**Il primo sindacato civico automatico**
Hackathon SuperAgents · consegna in 14 giorni · open source

---

## 0. TL;DR operativo

- **Missione MVP**: dimostrare in un solo quartiere pilota che 100+ cittadini possono lamentarsi in linguaggio naturale via WhatsApp/Telegram e VOCE aggrega automaticamente le loro segnalazioni, produce un dossier legale/mediatico firmabile e pubblica una dashboard di trasparenza — senza che nessuno si organizzi manualmente.
- **Stack**: Next.js 14 (App Router) su Vercel + Supabase (Postgres + pgvector + Auth + Storage) + Tailwind CSS + shadcn/ui personalizzato con design tokens di **Designers Italia / Bootstrap Italia**.
- **AI**: OpenAI `text-embedding-3-small` per gli embedding, HDBSCAN (via edge function Python su Supabase) per il clustering, `gpt-4o-mini` per la generazione atti. Fallback open: `nomic-embed-text` + `Mistral-7B-Instruct` via Together.ai.
- **Ingestione**: bot Telegram (nativo, zero costi) + bot WhatsApp via Twilio Sandbox (gratuito in dev).
- **Repo**: monorepo pnpm — `apps/web` (Next.js), `apps/worker` (edge functions), `packages/ui` (design system), `packages/db` (schema Supabase + migrations).
- **Licenza**: AGPL-3.0 (il codice resta comunale e non forkabile in prodotti chiusi).
- **Territorio pilota**: da scegliere tra Milano Corvetto, Napoli Sanità, Palermo Ballarò — vedi §13.

---

## 1. Perché il design del Ministero del Lavoro

Il design istituzionale italiano (Bootstrap Italia, adottato da Ministero del Lavoro, INPS, comuni PagoPA) ha tre proprietà che ci servono:

1. **Familiarità cognitiva**: il cittadino riconosce il pattern visivo dei servizi pubblici. Legittima VOCE senza spiegazioni.
2. **Accessibilità WCAG 2.1 AA di default**: obbligo di legge per servizi pubblici italiani. Contrasti, focus ring, screen-reader — tutto già validato.
3. **Framework semiotico anti-marketing**: nessun gradient viola, nessuna emoji, nessuna Silicon-Valley-vibes. Comunica seriousness civica.

Riferimenti canonici:

- **Design system**: https://designers.italia.it
- **Bootstrap Italia**: https://italia.github.io/bootstrap-italia
- **Linee guida design servizi digitali PA**: https://docs.italia.it/italia/design/lg-design-servizi-web/

Non forkiamo Bootstrap Italia (è Bootstrap 5, incompatibile con Tailwind). **Riproduciamo i suoi design token** in Tailwind config e in componenti shadcn/ui personalizzati. Vedi §4.

---

## 2. Architettura tecnica

```
┌─────────────────────────────────────────────────────────────────┐
│                      CANALI DI INGESTIONE                        │
├──────────────┬────────────────┬───────────────┬─────────────────┤
│  Telegram    │   WhatsApp     │  Web form     │  Voice (v2)     │
│    Bot       │  (Twilio)      │  (Next.js)    │  (Whisper)      │
└──────┬───────┴────────┬───────┴───────┬───────┴────────┬────────┘
       │                │               │                │
       ▼                ▼               ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│          Next.js Route Handlers /api/ingest/[channel]            │
│                    (Edge runtime, stateless)                     │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SUPABASE POSTGRES                           │
│  reports · embeddings (pgvector) · clusters · citizens · actions │
│              Row Level Security su ogni tabella                   │
└──────┬─────────────────────────────────────────┬─────────────────┘
       │                                          │
       ▼                                          ▼
┌────────────────────────┐            ┌──────────────────────────┐
│  Edge Function:        │            │  Supabase Realtime →      │
│  cluster-refresh       │◄───cron────│  Dashboard live update    │
│  (HDBSCAN + LLM label) │  (5 min)   │                           │
└────────┬───────────────┘            └──────────────────────────┘
         │
         ▼
┌────────────────────────┐
│  Edge Function:        │
│  generate-dossier      │──► Storage: dossier.pdf, esposto.docx
│  (LLM + template)      │──► Notify: email/telegram ai firmatari
└────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│         Next.js App Router (SSR + ISR) su Vercel                 │
│  /   /segnala   /cluster/[id]   /dossier/[id]   /comune/[slug]   │
└─────────────────────────────────────────────────────────────────┘
```

Motivazioni chiave:

- **Perché Next.js su Vercel**: Route Handlers Edge per bassa latenza ingestione bot, ISR per la dashboard pubblica (cache 60s), zero server da gestire.
- **Perché Supabase**: Postgres serio (RLS, triggers, pgvector), Auth OTP via SMS/email integrata, Realtime per la dashboard, Edge Functions Deno per il clustering, Storage per i PDF generati. Tutto in un piano gratuito che regge l'MVP.
- **Perché niente Redis / niente queue esterna**: 14 giorni. Postgres LISTEN/NOTIFY + Vercel cron bastano. Se cresciamo, si aggiunge Upstash.

---

## 3. Design system — Tokens Bootstrap Italia in Tailwind

### 3.1 Colori (da Bootstrap Italia `_variables.scss`)

```ts
// tailwind.config.ts
import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Blu Italia (primary)
        primary: {
          DEFAULT: "#0066CC",
          50: "#E6F1FB",
          100: "#CCE3F7",
          200: "#99C7EF",
          300: "#66ABE7",
          400: "#338FDF",
          500: "#0066CC", // brand
          600: "#0059B3",
          700: "#004080",
          800: "#00264D",
          900: "#001A33",
        },
        // Testo istituzionale
        ink: {
          DEFAULT: "#17324D",
          muted: "#5C6F82",
          subtle: "#A5B4C0",
        },
        // Superfici
        surface: {
          DEFAULT: "#FFFFFF",
          alt: "#F5F5F5",
          strong: "#E3E4E6",
        },
        // Semantica
        success: "#008758",
        warning: "#A66300",
        danger: "#D9364F",
        info: "#5C6F82",
        // Accento istituzionale (rare, per callout importanti)
        gold: "#B68A35",
      },
      fontFamily: {
        // Titillium Web = font ufficiale PA italiana (Google Fonts, gratuito)
        sans: ['"Titillium Web"', "system-ui", "sans-serif"],
        serif: ["Lora", "Georgia", "serif"], // per titoli editoriali
        mono: ['"Roboto Mono"', "monospace"],
      },
      fontSize: {
        // Scala tipografica Bootstrap Italia
        display: ["3rem", { lineHeight: "1.1", fontWeight: "700" }],
        h1: ["2.25rem", { lineHeight: "1.2", fontWeight: "700" }],
        h2: ["1.75rem", { lineHeight: "1.25", fontWeight: "700" }],
        h3: ["1.5rem", { lineHeight: "1.3", fontWeight: "600" }],
        h4: ["1.25rem", { lineHeight: "1.35", fontWeight: "600" }],
        body: ["1rem", { lineHeight: "1.5", fontWeight: "400" }],
        small: ["0.875rem", { lineHeight: "1.5", fontWeight: "400" }],
        caption: ["0.75rem", { lineHeight: "1.4", fontWeight: "400" }],
      },
      borderRadius: {
        // PA italiana usa raggi contenuti (mai pill design)
        DEFAULT: "4px",
        card: "8px",
        pill: "999px", // solo per tag stato
      },
      boxShadow: {
        // Ombre morbide, mai drammatiche
        card: "0 2px 8px rgba(23, 50, 77, 0.08)",
        modal: "0 8px 24px rgba(23, 50, 77, 0.16)",
      },
      spacing: {
        // Griglia 8px (standard Designers Italia)
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/forms")],
} satisfies Config;
```

### 3.2 Componenti chiave (shadcn/ui personalizzati)

Struttura in `packages/ui/`:

- `<HeaderIstituzionale>` — banda superiore con logo VOCE + tricolore (barra 4px in alto: verde/bianco/rosso)
- `<NavigazionePrincipale>` — nav sticky con link `Segnala`, `Cluster attivi`, `Dossier`, `Il tuo comune`
- `<CardIstituzionale>` — card bianca, bordo `border-surface-strong`, shadow `shadow-card`, radius `rounded-card`
- `<Bottone>` — variants: `primary` (blu pieno), `secondary` (blu bordato), `ghost`, `danger`. Sempre `min-h-[44px]` per touch target WCAG.
- `<Modulo>` — form wrapper con label sopra input, aiuto sotto, errore in rosso a destra
- `<TagStato>` — pill piccola per status: `nuovo`, `in-cluster`, `azione-attiva`, `chiuso`
- `<CalloutAvviso>` — box giallo/rosso/verde con icona, per messaggi importanti
- `<Breadcrumb>` — obbligatorio in ogni pagina interna (accessibilità PA)
- `<Footer>` — footer scuro con crediti open source, licenza, link a repo GitHub

### 3.3 Layout istituzionale (esempio pagina)

```tsx
// app/(public)/layout.tsx
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Tricolore ufficiale */}
      <div className="flex h-1 w-full">
        <div className="flex-1 bg-[#008C45]" />
        <div className="flex-1 bg-white" />
        <div className="flex-1 bg-[#CD212A]" />
      </div>

      {/* Header istituzionale */}
      <header className="border-b border-surface-strong bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <VoceLogo className="h-10 w-10 text-primary" />
            <div>
              <div className="text-h4 font-bold text-ink">VOCE</div>
              <div className="text-caption text-ink-muted">
                Il sindacato civico dei cittadini
              </div>
            </div>
          </div>
          <NavigazionePrincipale />
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-6xl px-6 py-10">
        {children}
      </main>

      <FooterIstituzionale />
    </>
  );
}
```

### 3.4 Regole di scrittura (voice & tone)

Copia le linee guida di Designers Italia:

- Verbi al presente e all'attivo. "Scrivi cosa ti è successo", mai "Le segnalazioni possono essere effettuate".
- Massimo 15 parole per frase in UI.
- Zero anglicismi non tradotti (dashboard → **quadro pubblico**; report → **segnalazione**; cluster → **gruppo**).
- Dai del "tu" al cittadino.

---

## 4. Schema database Supabase (SQL completo)

File `packages/db/migrations/0001_init.sql`:

```sql
-- Estensioni richieste
create extension if not exists "uuid-ossp";
create extension if not exists "vector";      -- pgvector per embeddings
create extension if not exists "postgis";     -- geolocalizzazione
create extension if not exists "pg_cron";     -- job schedulati

-- ============================================================
-- CITTADINI (auth + profilo minimale)
-- ============================================================
create table public.citizens (
  id uuid primary key default uuid_generate_v4(),
  phone_e164 text unique,          -- +393331234567
  telegram_id bigint unique,
  email text unique,
  neighborhood text,               -- "Corvetto", "Sanità"...
  city text,                       -- "Milano", "Napoli"...
  postal_code text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create index on citizens (city, neighborhood);

-- ============================================================
-- SEGNALAZIONI (report grezzo del cittadino)
-- ============================================================
create type report_channel as enum ('whatsapp', 'telegram', 'web', 'voice');
create type report_status  as enum ('nuovo', 'triaged', 'clustered', 'archiviato');

create table public.reports (
  id uuid primary key default uuid_generate_v4(),
  citizen_id uuid not null references citizens(id) on delete cascade,
  channel report_channel not null,
  raw_text text not null,                 -- il testo/trascrizione grezzo
  raw_media_urls text[] default '{}',     -- foto/audio in Supabase Storage
  location geography(Point, 4326),        -- lat/lng se disponibile
  location_hint text,                     -- "via Roma 15, Milano"
  category text,                          -- assegnata dall'LLM: sanità, mobilità...
  urgency smallint check (urgency between 1 and 5),
  status report_status not null default 'nuovo',
  cluster_id uuid references clusters(id) on delete set null,
  created_at timestamptz not null default now(),
  triaged_at timestamptz
);

create index on reports (status, created_at desc);
create index on reports (cluster_id);
create index on reports using gist (location);
create index on reports (category, city);

-- ============================================================
-- EMBEDDING (pgvector, tabella separata per performance)
-- ============================================================
create table public.report_embeddings (
  report_id uuid primary key references reports(id) on delete cascade,
  embedding vector(1536) not null,   -- text-embedding-3-small
  model text not null default 'text-embedding-3-small',
  created_at timestamptz not null default now()
);

-- IVFFlat per ricerca vettoriale rapida (>1000 righe)
create index on report_embeddings using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ============================================================
-- CLUSTER (gruppi di segnalazioni riconosciuti come "stesso problema")
-- ============================================================
create type cluster_status as enum ('emergente', 'attivo', 'in-azione', 'risolto', 'ignorato');

create table public.clusters (
  id uuid primary key default uuid_generate_v4(),
  title text not null,                 -- generato da LLM
  summary text not null,               -- 2-3 frasi
  category text not null,
  city text not null,
  neighborhood text,
  centroid geography(Point, 4326),
  radius_meters int,                   -- raggio geografico del cluster
  reports_count int not null default 0,
  citizens_count int not null default 0, -- distinti
  status cluster_status not null default 'emergente',
  threshold_reached_at timestamptz,    -- quando ha superato N segnalazioni
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on clusters (city, neighborhood, status);
create index on clusters (status, updated_at desc);

-- ============================================================
-- AZIONI (dossier, esposti, accessi civici generati)
-- ============================================================
create type action_kind as enum (
  'esposto_procura',
  'accesso_civico',
  'segnalazione_difensore_civico',
  'mozione_consigliere',
  'dossier_giornalistico',
  'diffida_pa'
);

create type action_status as enum (
  'bozza',            -- generata da LLM, da revisionare
  'in_firma',         -- aperta alla raccolta firme
  'inviata',          -- protocollata / inviata
  'risposta_ricevuta',
  'archiviata'
);

create table public.actions (
  id uuid primary key default uuid_generate_v4(),
  cluster_id uuid not null references clusters(id) on delete cascade,
  kind action_kind not null,
  status action_status not null default 'bozza',
  title text not null,
  body_markdown text not null,         -- corpo dell'atto in markdown
  pdf_url text,                        -- Supabase Storage
  docx_url text,
  recipient text,                      -- "Procura di Milano", "Sindaco XXX"...
  signatures_count int not null default 0,
  signatures_target int not null default 50,
  submitted_at timestamptz,
  response_received_at timestamptz,
  response_text text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- FIRME (delega di un cittadino a un'azione)
-- ============================================================
create table public.signatures (
  id uuid primary key default uuid_generate_v4(),
  action_id uuid not null references actions(id) on delete cascade,
  citizen_id uuid not null references citizens(id) on delete cascade,
  signed_at timestamptz not null default now(),
  ip_hash text,
  unique (action_id, citizen_id)
);

create index on signatures (action_id);

-- ============================================================
-- COMUNI (contatti PA per invio automatico)
-- ============================================================
create table public.pa_endpoints (
  id uuid primary key default uuid_generate_v4(),
  city text not null,
  role text not null,             -- "sindaco", "difensore_civico", "procura"...
  name text,
  email text,
  pec text,
  address text,
  updated_at timestamptz default now()
);

create index on pa_endpoints (city, role);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table citizens         enable row level security;
alter table reports          enable row level security;
alter table report_embeddings enable row level security;
alter table clusters         enable row level security;
alter table actions          enable row level security;
alter table signatures       enable row level security;

-- Citizens: ognuno legge solo se stesso
create policy citizen_self_read on citizens
  for select using (auth.uid() = id);

-- Reports: il cittadino vede solo i propri; tutti vedono aggregati anonimi via view
create policy report_owner_read on reports
  for select using (citizen_id = auth.uid());
create policy report_owner_insert on reports
  for insert with check (citizen_id = auth.uid());

-- Clusters: PUBBLICI in lettura (è la dashboard di trasparenza)
create policy cluster_public_read on clusters
  for select using (true);

-- Actions: PUBBLICHE in lettura
create policy action_public_read on actions
  for select using (true);

-- Signatures: cittadino firma solo per sé; conta aggregata pubblica via view
create policy signature_own_insert on signatures
  for insert with check (citizen_id = auth.uid());
create policy signature_own_read on signatures
  for select using (citizen_id = auth.uid());

-- View pubblica per contare firme senza esporre identità
create view public.action_signature_counts as
  select action_id, count(*) as n
  from signatures
  group by action_id;

-- ============================================================
-- TRIGGER: aggiorna contatori cluster
-- ============================================================
create or replace function bump_cluster_counters() returns trigger as $$
begin
  update clusters c
     set reports_count = (select count(*) from reports where cluster_id = c.id),
         citizens_count = (select count(distinct citizen_id) from reports where cluster_id = c.id),
         updated_at = now()
   where c.id = coalesce(new.cluster_id, old.cluster_id);
  return coalesce(new, old);
end $$ language plpgsql;

create trigger reports_after_change
  after insert or update or delete on reports
  for each row execute function bump_cluster_counters();

-- ============================================================
-- FUNZIONE RPC: match vettoriale per triage nuova segnalazione
-- ============================================================
create or replace function match_similar_reports(
  query_embedding vector(1536),
  match_threshold float default 0.82,
  match_count int default 20,
  filter_city text default null,
  filter_neighborhood text default null
) returns table (
  report_id uuid,
  cluster_id uuid,
  similarity float
) language sql stable as $$
  select
    r.id as report_id,
    r.cluster_id,
    1 - (e.embedding <=> query_embedding) as similarity
  from report_embeddings e
  join reports r on r.id = e.report_id
  where 1 - (e.embedding <=> query_embedding) > match_threshold
    and (filter_city is null or r.city = filter_city)
    and (filter_neighborhood is null or r.neighborhood = filter_neighborhood)
  order by e.embedding <=> query_embedding
  limit match_count;
$$;
```

Note operative:

- **RLS attivo ovunque**: nessuna via per cittadino A di leggere i report di cittadino B.
- **Cluster e actions pubblici**: sono l'output civico, DEVONO essere trasparenti.
- **pgvector con IVFFlat**: sufficiente fino a ~100k report; oltre si passa a HNSW.

---

## 5. API — Next.js Route Handlers

### 5.1 Ingestione (multi-canale)

**`POST /api/ingest/telegram`** — webhook di Telegram Bot API

```ts
// app/api/ingest/telegram/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { triageReport } from "@/lib/ai/triage";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  const update = await req.json();
  const msg = update.message;
  if (!msg?.text) return NextResponse.json({ ok: true });

  const supabase = createServiceClient();

  // 1. upsert cittadino da telegram_id
  const { data: citizen } = await supabase
    .from("citizens")
    .upsert(
      { telegram_id: msg.from.id, last_seen_at: new Date().toISOString() },
      { onConflict: "telegram_id" },
    )
    .select()
    .single();

  // 2. insert report grezzo
  const { data: report } = await supabase
    .from("reports")
    .insert({
      citizen_id: citizen.id,
      channel: "telegram",
      raw_text: msg.text,
      status: "nuovo",
    })
    .select()
    .single();

  // 3. triage async (non blocca il webhook)
  fetch(`${process.env.APP_URL}/api/internal/triage`, {
    method: "POST",
    headers: { "x-internal-key": process.env.INTERNAL_KEY! },
    body: JSON.stringify({ reportId: report.id }),
  }).catch(() => {});

  // 4. risposta immediata all'utente via Telegram
  await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: msg.chat.id,
        text:
          "✅ Grazie. Ho ricevuto la tua segnalazione.\n\n" +
          "La sto confrontando con quelle di altri cittadini della tua zona. " +
          "Ti avviserò appena diventa parte di un'azione collettiva.\n\n" +
          `Vedi lo stato: ${process.env.APP_URL}/le-mie-segnalazioni/${report.id}`,
      }),
    },
  );

  return NextResponse.json({ ok: true });
}
```

**`POST /api/ingest/whatsapp`** — webhook Twilio (formato x-www-form-urlencoded)

```ts
// app/api/ingest/whatsapp/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import twilio from "twilio";

export const runtime = "nodejs"; // twilio SDK non gira su edge

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const from = form.get("From") as string; // "whatsapp:+393331234567"
  const body = form.get("Body") as string;
  const phone = from.replace("whatsapp:", "");

  const supabase = createServiceClient();

  const { data: citizen } = await supabase
    .from("citizens")
    .upsert(
      { phone_e164: phone, last_seen_at: new Date().toISOString() },
      { onConflict: "phone_e164" },
    )
    .select()
    .single();

  const { data: report } = await supabase
    .from("reports")
    .insert({ citizen_id: citizen.id, channel: "whatsapp", raw_text: body })
    .select()
    .single();

  fetch(`${process.env.APP_URL}/api/internal/triage`, {
    method: "POST",
    headers: { "x-internal-key": process.env.INTERNAL_KEY! },
    body: JSON.stringify({ reportId: report.id }),
  }).catch(() => {});

  // TwiML response
  const twiml = new twilio.twiml.MessagingResponse();
  twiml.message(
    "Grazie! Ho ricevuto la tua segnalazione.\n" +
      "Ti avviso appena diventa parte di un'azione collettiva.",
  );
  return new NextResponse(twiml.toString(), {
    headers: { "content-type": "text/xml" },
  });
}
```

**`POST /api/ingest/web`** — form dal sito, auth OTP obbligatoria

```ts
// app/api/ingest/web/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createRouteClient } from "@/lib/supabase/route";
import { z } from "zod";

const Schema = z.object({
  text: z.string().min(20).max(2000),
  location_hint: z.string().optional(),
  category_hint: z.string().optional(),
  media_urls: z.array(z.string().url()).optional(),
});

export async function POST(req: NextRequest) {
  const supabase = createRouteClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Schema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );

  const { data: report, error } = await supabase
    .from("reports")
    .insert({
      citizen_id: user.id,
      channel: "web",
      raw_text: parsed.data.text,
      location_hint: parsed.data.location_hint,
      raw_media_urls: parsed.data.media_urls ?? [],
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error }, { status: 500 });

  // triage sincrono via Server Action interna
  await triageReport(report.id);

  return NextResponse.json({ report });
}
```

### 5.2 Triage (interno, invocato da ogni canale)

**`POST /api/internal/triage`** — protetto da header interno

```ts
// app/api/internal/triage/route.ts
import { NextRequest, NextResponse } from "next/server";
import { triageReport } from "@/lib/ai/triage";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  if (req.headers.get("x-internal-key") !== process.env.INTERNAL_KEY) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { reportId } = await req.json();
  const result = await triageReport(reportId);
  return NextResponse.json(result);
}
```

Il core in `lib/ai/triage.ts`:

```ts
import OpenAI from "openai";
import { createServiceClient } from "@/lib/supabase/service";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function triageReport(reportId: string) {
  const sb = createServiceClient();

  const { data: report } = await sb
    .from("reports")
    .select("*")
    .eq("id", reportId)
    .single();
  if (!report) throw new Error("report not found");

  // 1. Estrazione strutturata (categoria, urgenza, geo hint)
  const structured = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Estrai dalla segnalazione JSON con:
- category: una tra [sanita, mobilita, ambiente, sicurezza, scuola, servizi_sociali, urbanistica, trasparenza, altro]
- urgency: 1-5 (5 = pericolo immediato)
- location_hint: indirizzo o luogo se citato, altrimenti null
- clean_text: la segnalazione riscritta in italiano formale, mantenendo i fatti`,
      },
      { role: "user", content: report.raw_text },
    ],
  });
  const meta = JSON.parse(structured.choices[0].message.content!);

  // 2. Embedding sul clean_text
  const emb = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: meta.clean_text,
  });
  const vector = emb.data[0].embedding;

  // 3. Cerca cluster esistenti simili nella stessa città/quartiere
  const { data: matches } = await sb.rpc("match_similar_reports", {
    query_embedding: vector,
    match_threshold: 0.82,
    match_count: 10,
    filter_city: report.city,
    filter_neighborhood: report.neighborhood,
  });

  // Trova il cluster più frequente tra i match
  const clusterVotes = new Map<string, number>();
  for (const m of matches ?? []) {
    if (m.cluster_id)
      clusterVotes.set(m.cluster_id, (clusterVotes.get(m.cluster_id) ?? 0) + 1);
  }
  const bestCluster = [...clusterVotes.entries()].sort(
    (a, b) => b[1] - a[1],
  )[0]?.[0];

  // 4. Salva embedding + aggiorna report
  await sb
    .from("report_embeddings")
    .insert({ report_id: reportId, embedding: vector });
  await sb
    .from("reports")
    .update({
      category: meta.category,
      urgency: meta.urgency,
      location_hint: meta.location_hint ?? report.location_hint,
      status: bestCluster ? "clustered" : "triaged",
      cluster_id: bestCluster,
      triaged_at: new Date().toISOString(),
    })
    .eq("id", reportId);

  // 5. Se cluster ha raggiunto soglia → trigger generate-dossier
  if (bestCluster) {
    const { data: cluster } = await sb
      .from("clusters")
      .select("*")
      .eq("id", bestCluster)
      .single();
    if (cluster.citizens_count >= 30 && cluster.status === "emergente") {
      await sb
        .from("clusters")
        .update({
          status: "attivo",
          threshold_reached_at: new Date().toISOString(),
        })
        .eq("id", bestCluster);

      fetch(`${process.env.APP_URL}/api/internal/generate-dossier`, {
        method: "POST",
        headers: { "x-internal-key": process.env.INTERNAL_KEY! },
        body: JSON.stringify({ clusterId: bestCluster }),
      }).catch(() => {});
    }
  }

  return { clustered: !!bestCluster, category: meta.category };
}
```

### 5.3 Ri-clustering periodico (crea nuovi cluster)

`GET /api/cron/recluster` — Vercel Cron ogni 15 minuti su report `status='triaged'` (non ancora clusterizzati). Chiama Supabase Edge Function Deno che esegue HDBSCAN via `scikit-learn` wrappato:

```ts
// vercel.json
{
  "crons": [
    { "path": "/api/cron/recluster", "schedule": "*/15 * * * *" },
    { "path": "/api/cron/dossier-refresh", "schedule": "0 * * * *" }
  ]
}
```

Edge Function `supabase/functions/cluster-refresh/index.ts` (Deno):

```ts
// Deno + PyScript-free: usa clustering "poor man" — DBSCAN via calcolo distanze in SQL
// Per l'MVP evitiamo HDBSCAN esterno: sfruttiamo pgvector direttamente.
import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async () => {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SERVICE_ROLE_KEY")!,
  );

  // Report senza cluster negli ultimi 7gg
  const { data: pending } = await sb
    .from("reports")
    .select("id, city, neighborhood, category")
    .is("cluster_id", null)
    .eq("status", "triaged")
    .gte("created_at", new Date(Date.now() - 7 * 864e5).toISOString());

  for (const r of pending ?? []) {
    // Trova >=5 report simili senza cluster nella stessa zona → crea cluster
    const { data: neighbors } = await sb.rpc("match_similar_reports", {
      query_embedding: (
        await sb
          .from("report_embeddings")
          .select("embedding")
          .eq("report_id", r.id)
          .single()
      ).data!.embedding,
      match_threshold: 0.84,
      match_count: 50,
      filter_city: r.city,
      filter_neighborhood: r.neighborhood,
    });
    const orphans = (neighbors ?? []).filter((n) => !n.cluster_id);
    if (orphans.length >= 5) {
      // Chiama LLM per generare title/summary
      const summary = await summarizeCluster(orphans.map((o) => o.report_id));
      const { data: cluster } = await sb
        .from("clusters")
        .insert({
          title: summary.title,
          summary: summary.summary,
          category: r.category,
          city: r.city,
          neighborhood: r.neighborhood,
        })
        .select()
        .single();
      // assegna tutti gli orfani
      await sb
        .from("reports")
        .update({ cluster_id: cluster.id, status: "clustered" })
        .in(
          "id",
          orphans.map((o) => o.report_id),
        );
    }
  }
  return new Response("ok");
});
```

### 5.4 Generazione dossier

**`POST /api/internal/generate-dossier`** — crea per un cluster: (a) esposto Procura, (b) accesso civico, (c) dossier giornalistico, (d) mozione consigliere.

```ts
// lib/ai/dossier.ts
export async function generateDossier(clusterId: string) {
  const sb = createServiceClient();
  const { data: cluster } = await sb
    .from("clusters")
    .select("*")
    .eq("id", clusterId)
    .single();
  const { data: reports } = await sb
    .from("reports")
    .select("raw_text, created_at, location_hint")
    .eq("cluster_id", clusterId)
    .limit(200);

  const context = reports!
    .map(
      (r, i) =>
        `[${i + 1}] ${r.created_at.slice(0, 10)} — ${r.location_hint ?? "n/d"}: ${r.raw_text}`,
    )
    .join("\n");

  for (const kind of [
    "esposto_procura",
    "accesso_civico",
    "dossier_giornalistico",
    "mozione_consigliere",
  ]) {
    const prompt = PROMPTS[kind](cluster, context);
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
    });
    await sb.from("actions").insert({
      cluster_id: clusterId,
      kind,
      title: prompt.title(cluster),
      body_markdown: res.choices[0].message.content!,
      status: "in_firma",
      signatures_target: kind === "esposto_procura" ? 100 : 30,
    });
  }
}
```

Template di prompt in `lib/ai/prompts.ts` — uno per ciascun tipo di atto, con istruzioni giuridiche esplicite (riferimenti a L. 241/1990, D.Lgs. 33/2013, art. 2051 c.c. ecc.). Ogni bozza generata **richiede revisione manuale** prima dello status `inviata`.

### 5.5 Firma di un'azione

**`POST /api/actions/:id/sign`** — cittadino autenticato aggiunge la sua firma

```ts
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createRouteClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const ipHash = await hashIp(req.headers.get("x-forwarded-for") ?? "");
  const { error } = await supabase
    .from("signatures")
    .insert({ action_id: params.id, citizen_id: user.id, ip_hash: ipHash });
  if (error?.code === "23505")
    return NextResponse.json({ error: "già firmato" }, { status: 409 });
  if (error) return NextResponse.json({ error }, { status: 500 });

  // aggiorna contatore su actions
  await supabase.rpc("bump_signatures", { action_uuid: params.id });
  return NextResponse.json({ ok: true });
}
```

### 5.6 API pubbliche (dashboard di trasparenza)

Tutte in App Router come **Server Components** (nessun endpoint REST separato, minor superficie di attacco):

- `GET /` — landing con contatore live cittadini attivi + ultimi cluster
- `GET /segnala` — form di segnalazione
- `GET /cluster` — elenco cluster attivi, filtri per città/categoria
- `GET /cluster/[id]` — dettaglio cluster: mappa punti (blurrati a 300m per privacy), timeline, azioni collegate, firmatari (solo conteggio)
- `GET /dossier/[actionId]` — dettaglio azione, pulsante firma, download PDF
- `GET /comune/[slug]` — pagina città con statistiche aggregate: N segnalazioni, N cluster, N azioni inviate, N risposte ricevute
- `GET /trasparenza` — quadro nazionale: quali comuni rispondono di più/meno

### 5.7 API JSON aperte (per giornalisti e ricercatori)

- `GET /api/public/clusters?city=milano&status=attivo` — JSON list
- `GET /api/public/actions?kind=accesso_civico&submitted_after=2026-01-01`
- `GET /api/public/stats/comuni` — CSV scaricabile

Rate-limit 60 req/min via Vercel `x-forwarded-for`. Nessuna auth richiesta: **è il punto**.

---

## 6. Struttura frontend (App Router)

```
apps/web/
├── app/
│   ├── (public)/
│   │   ├── layout.tsx                  # header istituzionale + tricolore
│   │   ├── page.tsx                    # landing
│   │   ├── segnala/page.tsx
│   │   ├── cluster/page.tsx
│   │   ├── cluster/[id]/page.tsx
│   │   ├── dossier/[id]/page.tsx
│   │   ├── comune/[slug]/page.tsx
│   │   └── trasparenza/page.tsx
│   ├── (auth)/
│   │   ├── accedi/page.tsx             # OTP via SMS/email
│   │   └── le-mie-segnalazioni/page.tsx
│   ├── api/
│   │   ├── ingest/telegram/route.ts
│   │   ├── ingest/whatsapp/route.ts
│   │   ├── ingest/web/route.ts
│   │   ├── actions/[id]/sign/route.ts
│   │   ├── cron/recluster/route.ts
│   │   ├── cron/dossier-refresh/route.ts
│   │   ├── internal/triage/route.ts
│   │   ├── internal/generate-dossier/route.ts
│   │   └── public/
│   │       ├── clusters/route.ts
│   │       ├── actions/route.ts
│   │       └── stats/comuni/route.ts
│   └── layout.tsx                      # <html>, font Titillium, meta
├── components/
│   ├── ui/                             # shadcn base
│   ├── istituzionale/
│   │   ├── HeaderIstituzionale.tsx
│   │   ├── FooterIstituzionale.tsx
│   │   ├── Tricolore.tsx
│   │   ├── Breadcrumb.tsx
│   │   ├── CalloutAvviso.tsx
│   │   └── CardIstituzionale.tsx
│   ├── clusters/
│   │   ├── ClusterCard.tsx
│   │   ├── ClusterMap.tsx              # react-leaflet + tile OSM
│   │   └── ClusterTimeline.tsx
│   └── forms/
│       ├── FormSegnalazione.tsx
│       └── FormFirma.tsx
├── lib/
│   ├── supabase/
│   │   ├── service.ts                  # service role, solo server
│   │   ├── route.ts                    # route handlers
│   │   └── client.ts                   # browser
│   ├── ai/
│   │   ├── triage.ts
│   │   ├── dossier.ts
│   │   └── prompts.ts
│   └── utils/
│       ├── geo.ts                      # blur coordinate a 300m
│       └── hash.ts
├── public/
│   └── fonts/                          # Titillium Web self-hosted
├── tailwind.config.ts
├── next.config.mjs
└── package.json
```

Pagine chiave (specifica di contenuto):

### 6.1 Landing `/`

Sezione hero con:

- Titolo `<h1>`: _"Il primo sindacato civico automatico"_
- Sottotitolo: _"Racconta un problema del tuo quartiere. Se non sei da sola, VOCE lo trasforma in azione."_
- Due bottoni primari: `Segnala su Telegram` (`t.me/try_voce_bot`) e `Segnala sul sito`
- Contatore live (Realtime Supabase): _"1.247 cittadini attivi · 43 cluster in azione · 8 risposte da PA ricevute questa settimana"_
- Card 3 colonne: _Come funziona_ (racconta → aggreghiamo → agiamo), con icone SVG minimali

Sotto:

- **Ultimi cluster attivi nella tua città** (geolocalizza da IP con Vercel Geolocation, fallback selettore)
- **Azioni in raccolta firme** con progress bar

### 6.2 `/segnala` — cuore dell'esperienza

Form a step (senza multi-page, con progressive disclosure):

1. **Cosa è successo?** — textarea grande, placeholder concreto: _"Es. Ieri al pronto soccorso del San Paolo ho aspettato 8 ore per un dolore al petto. Non è la prima volta."_
2. **Dove?** — autocompletamento indirizzo (Nominatim OSM), + pulsante "usa la mia posizione"
3. **Vuoi aggiungere una foto?** — upload opzionale (Supabase Storage)
4. **Come ti chiami?** — nome + telefono OR email (per OTP). Nessun dato inutile.
5. **Invia** — poi schermata di conferma con: _"Grazie. Stiamo confrontando la tua segnalazione con quelle di altri cittadini. Riceverai un messaggio appena diventa parte di un'azione collettiva."_

Micro-copy WCAG-compliant, ogni campo ha `<label>` visibile, errori inline in rosso `#D9364F`.

### 6.3 `/cluster/[id]` — la trasparenza in atto

Layout in due colonne (desktop):

Sinistra:

- Titolo cluster + `<TagStato>` (`attivo`, `in-azione`, `risolto`)
- Riassunto in 2 frasi
- Timeline verticale delle segnalazioni (data + estratto anonimizzato)
- Mappa con punti sfumati a raggio 300m (privacy)

Destra:

- Numeri chiave: `43 cittadini · 67 segnalazioni · 12 giorni attivi`
- Azioni collegate (card per ciascuna): _Esposto Procura_, _Accesso civico al Comune_, _Mozione depositata_
- Pulsante `Firma anche tu` (richiede login)

### 6.4 `/dossier/[actionId]` — anatomia di un atto

- Header: titolo dell'atto, destinatario, cluster di origine, stato
- Preview markdown dell'atto (rendered con `react-markdown` + prose Tailwind)
- Progress firma: `47/100 firme raccolte`
- Bottone primario: `Firma anche tu` (auth OTP se non loggato)
- Sidebar: `Scarica PDF`, `Scarica DOCX`, `Copia link`
- Sotto: cronologia (`bozza` → `in_firma` → `inviata` → `risposta_ricevuta`)

---

## 7. Autenticazione

Supabase Auth con:

- **OTP via email** come default (gratis, illimitato)
- **OTP via SMS** via Twilio (richiesto per firma di azioni: garanzia identità)
- **Telegram login** automatico (associazione `telegram_id`)

Middleware `middleware.ts`:

```ts
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  await supabase.auth.getSession();
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

Pagine sotto `(auth)` richiedono utente loggato — Server Component redirige a `/accedi` altrimenti.

---

## 8. Configurazione Vercel

`vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "regions": ["fra1"],
  "crons": [
    { "path": "/api/cron/recluster", "schedule": "*/15 * * * *" },
    { "path": "/api/cron/dossier-refresh", "schedule": "0 * * * *" },
    { "path": "/api/cron/notify-signatures", "schedule": "0 9 * * *" }
  ]
}
```

Variabili d'ambiente (in Vercel Project Settings):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
TELEGRAM_BOT_TOKEN=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
INTERNAL_KEY=<random 32 char>
APP_URL=https://voce-civica.vercel.app
```

Setup post-deploy:

1. `supabase migration up` → applica schema
2. Registra webhook Telegram: `curl "https://api.telegram.org/bot$TOKEN/setWebhook?url=$APP_URL/api/ingest/telegram"`
3. In Twilio console → WhatsApp Sandbox → webhook URL = `$APP_URL/api/ingest/whatsapp`

---

## 9. Roadmap 14 giorni

Divisione lavoro ipotetica per team di 3 (Full-stack + AI + Design/Content). Se sei da solo, taglia §Design a metà e usa i template Bootstrap Italia già pronti.

### Settimana 1 — Fondamenta

**Giorno 1-2 · Setup**

- Init monorepo pnpm (`apps/web`, `packages/ui`, `packages/db`)
- Supabase project + apply `0001_init.sql`
- Deploy Vercel + collegamento GitHub
- Setup domini (`voce.civica.dev` o simile)
- Setup design system: Titillium Web self-hosted, `tailwind.config.ts` con token
- Componenti base: `HeaderIstituzionale`, `Tricolore`, `Bottone`, `CardIstituzionale`

**Giorno 3-4 · Ingestione**

- Route `/api/ingest/telegram` + registrazione webhook
- Route `/api/ingest/whatsapp` (Twilio Sandbox)
- Route `/api/ingest/web` + form `/segnala`
- Auth OTP (email) funzionante
- Salvataggio corretto in Supabase con RLS testato

**Giorno 5-6 · Triage AI**

- `lib/ai/triage.ts` completo
- Route `/api/internal/triage`
- Test end-to-end: segnalazione via Telegram → embedding → categoria → salvata

**Giorno 7 · Cluster**

- Edge function `cluster-refresh` in Supabase
- Vercel cron `/api/cron/recluster`
- Test con 50 segnalazioni sintetiche → verifica clustering coerente

### Settimana 2 — Prodotto pubblico

**Giorno 8-9 · Dashboard**

- Pagina `/` con contatori live (Supabase Realtime)
- Pagina `/cluster` con filtri
- Pagina `/cluster/[id]` con mappa, timeline, azioni

**Giorno 10-11 · Dossier + firma**

- `lib/ai/dossier.ts` con 4 template (esposto, accesso civico, mozione, dossier)
- Route `/api/internal/generate-dossier`
- Pagina `/dossier/[id]` con markdown render + firma
- Route firma + protezione anti-duplicati
- Generazione PDF (via `@react-pdf/renderer` o `puppeteer-core` su Vercel)

**Giorno 12 · API pubbliche + trasparenza**

- Route `/api/public/*`
- Pagina `/trasparenza` con stats aggregate
- Export CSV/JSON

**Giorno 13 · Pilot data + rifinitura**

- Seed manuale del quartiere pilota (contatti PA, categorie locali)
- Bug bash con 5 tester reali (parenti/amici) → 10 segnalazioni test
- Fix accessibility WCAG con axe-core
- SEO minimo: meta OG, sitemap, robots

**Giorno 14 · Demo + submission**

- Video demo 3 minuti (Loom): flusso completo dalla segnalazione al dossier firmato
- README completo su GitHub con setup locale in <10 minuti
- Deploy finale
- Submission hackathon

### Deliverable minimo per la valutazione

- [ ] Repo pubblico AGPL-3.0
- [ ] Deploy live raggiungibile
- [ ] Bot Telegram funzionante `@try_voce_bot`
- [ ] Almeno un cluster reale generato da almeno 5 utenti diversi
- [ ] Almeno un dossier (bozza esposto) generato e visibile pubblicamente
- [ ] Video demo 3 minuti
- [ ] Documentazione: come replicare in un altro comune

---

## 10. Costi stimati (14 giorni + primo mese)

| Voce                                              | MVP       | Primo mese                   |
| ------------------------------------------------- | --------- | ---------------------------- |
| Vercel Hobby                                      | 0 €       | 0 €                          |
| Supabase Free                                     | 0 €       | 0 € (fino a 500MB + 50k MAU) |
| OpenAI (`gpt-4o-mini` + `text-embedding-3-small`) | ~15 €     | ~50 €                        |
| Twilio WhatsApp Sandbox                           | 0 €       | 0 €                          |
| Twilio SMS OTP (1000 firme)                       | 0 €       | ~30 €                        |
| Dominio                                           | 12 €      | 0 €                          |
| **Totale**                                        | **~30 €** | **~80 €**                    |

Ampiamente sostenibile con qualunque piccolo grant civico o crowdfunding di quartiere.

---

## 11. Sicurezza, privacy, etica

- **GDPR**: base giuridica art. 6(1)(e) — interesse pubblico. Registro dei trattamenti obbligatorio, redigere DPIA prima del pilot.
- **Anonimizzazione output pubblico**: coordinate arrotondate a 300m, testi passati da LLM che rimuove nomi propri prima di essere mostrati in cluster pubblici.
- **Diritto all'oblio**: endpoint `DELETE /api/citizens/me` che cascade elimina tutto (RLS + `on delete cascade`).
- **Prevenzione abuso**: rate-limit per phone/telegram_id (max 5 segnalazioni/ora), filtro contenuti offensivi via `omni-moderation-latest`.
- **Trasparenza AI**: ogni azione generata mostra un banner _"Bozza generata da AI, revisionata da [nome umano]"_. Nessun atto viene inviato senza revisione umana.
- **Sicurezza tecnica**: RLS su ogni tabella, service role key mai esposta client-side, INTERNAL_KEY per webhook interni, Content Security Policy stretta.

---

## 12. Post-hackathon (roadmap 3-6 mesi)

Se vinciamo la Builder Residency:

- **Voice input** (Whisper via OpenAI): fondamentale per over-65 e non-nativi
- **Integrazione IO / SPID**: per firme legalmente qualificate
- **Multi-comune**: onboarding self-serve per associazioni di quartiere
- **Notifiche PA**: monitoraggio automatico PEC comuni per intercettare risposte
- **Fine-tuning modello**: dataset di ricorsi TAR/atti civici italiani per generazione più precisa
- **Federation**: ogni istanza VOCE è autonoma ma condivide (opt-in) statistiche a un indice nazionale
- **App mobile**: PWA prima, native poi
- **Partnership**: ActionAid, Cittadinanzattiva, Libera, Slow Food, Fondazione Openpolis

Modello economico sostenibile (post-MVP):

- Comuni pagano canone modico per dashboard privata + analytics interne
- Fondazioni sostengono le istanze territoriali
- Codice sempre AGPL-3.0

---

## 13. Territorio pilota — criteri di scelta

Tre candidati, uno da scegliere entro giorno 2:

| Quartiere           | Pro                                                                                                   | Contro                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Milano Corvetto** | Alta densità di associazioni attive, buona penetrazione smartphone, PA reattiva a pressione mediatica | Overcrowded di iniziative civiche, meno "vergine"                |
| **Napoli Sanità**   | Rete comunitaria fortissima, casi civici estremamente concreti, potenziale storytelling               | Rapporto complicato con istituzioni, rischio strumentalizzazione |
| **Palermo Ballarò** | Necessità reale drammatica, mix demografico ricco, appoggio possibile da Moltivolti e simili          | Digital divide reale, richiede modalità voice fin dall'MVP       |

**Raccomandazione**: partire da **Corvetto** per l'MVP (barriera all'ingresso bassa, feedback rapido, alta probabilità di generare un cluster reale in 14 giorni) e presentare al pitch un piano di espansione verso Sanità e Ballarò con voice input.

---

## 14. Prossimi 3 passi concreti

1. Creare il repo GitHub `voce-civica` sotto un'organizzazione neutrale, licenza AGPL-3.0, README con questo PLAN in radice.
2. Aprire progetto Supabase, applicare `0001_init.sql`, verificare `pgvector` attivo.
3. Registrare bot Telegram `@try_voce_bot` via `@BotFather`, ottenere token, salvarlo tra i secrets Vercel.

Da lì, il resto è esecuzione.
