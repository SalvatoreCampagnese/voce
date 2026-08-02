-- ============================================================================
-- VOCE — schema iniziale
--
-- Ordine di creazione obbligatorio: citizens → clusters → reports → ...
-- In PLAN.md §4 `reports` referenzia `clusters` prima che `clusters` esista:
-- quella migration non gira. Qui l'ordine è corretto.
-- ============================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists vector;     -- pgvector, embedding delle segnalazioni
create extension if not exists postgis;    -- geografia

-- ============================================================================
-- TIPI
-- ============================================================================

create type public.report_channel as enum ('whatsapp', 'telegram', 'web', 'voice');

-- 'quarantena': la moderazione ha segnalato il contenuto. Non si scarta mai una
-- segnalazione: si mette da parte per revisione umana.
create type public.report_status as enum (
  'nuovo', 'triaged', 'clustered', 'quarantena', 'archiviato'
);

create type public.cluster_status as enum (
  'emergente', 'attivo', 'in_azione', 'risolto', 'ignorato'
);

create type public.action_kind as enum (
  'esposto_procura',
  'accesso_civico',
  'segnalazione_difensore_civico',
  'mozione_consigliere',
  'dossier_giornalistico',
  'diffida_pa'
);

create type public.action_status as enum (
  'bozza',              -- generata dall'LLM, mai inviabile senza revisione umana
  'in_firma',
  'inviata',
  'risposta_ricevuta',
  'archiviata'
);

-- ============================================================================
-- CITTADINI
--
-- citizens NON coincide con auth.users: chi scrive da Telegram esiste senza
-- account (auth_user_id null) e viene collegato al primo accesso OTP.
-- Tutte le policy RLS confrontano auth_user_id, mai id.
-- ============================================================================

create table public.citizens (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid unique references auth.users(id) on delete set null,
  phone_e164    text unique,
  telegram_id   bigint unique,
  email         text unique,
  display_name  text,
  city          text,
  neighborhood  text,
  postal_code   text,
  is_synthetic  boolean not null default false,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz,

  -- Un cittadino deve essere raggiungibile su almeno un canale, altrimenti non
  -- possiamo avvisarlo quando la sua segnalazione diventa un'azione.
  constraint citizens_has_identifier check (
    phone_e164 is not null or telegram_id is not null or email is not null
  )
);

create index citizens_city_neighborhood_idx on public.citizens (city, neighborhood);
create index citizens_auth_user_id_idx      on public.citizens (auth_user_id);

comment on column public.citizens.auth_user_id is
  'Collegamento a auth.users. Null per chi scrive dai bot senza aver mai fatto login.';

-- ============================================================================
-- GRUPPI (cluster di segnalazioni sullo stesso problema)
-- Creata PRIMA di reports perché reports.cluster_id la referenzia.
-- ============================================================================

create table public.clusters (
  id                   uuid primary key default gen_random_uuid(),
  title                text not null,
  summary              text not null,
  category             text not null,
  city                 text not null,
  neighborhood         text,
  centroid             geography(Point, 4326),
  radius_meters        int,
  reports_count        int not null default 0,
  citizens_count       int not null default 0,  -- cittadini DISTINTI
  status               public.cluster_status not null default 'emergente',
  is_synthetic         boolean not null default false,
  threshold_reached_at timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index clusters_city_status_idx on public.clusters (city, neighborhood, status);
create index clusters_status_updated_idx on public.clusters (status, updated_at desc);

comment on column public.clusters.citizens_count is
  'Cittadini distinti. Le soglie di azione contano persone, non messaggi: '
  'chi scrive trenta volte non è un movimento.';

-- ============================================================================
-- SEGNALAZIONI
-- ============================================================================

create table public.reports (
  id            uuid primary key default gen_random_uuid(),
  -- Nullable di proposito: quando un cittadino esercita il diritto all'oblio ma
  -- la sua segnalazione è già confluita in un atto protocollato, il contributo
  -- resta in forma anonima e il legame con la persona viene reciso.
  -- Vedi delete_citizen_account() nella migration 0002.
  citizen_id    uuid references public.citizens(id) on delete set null,
  cluster_id    uuid references public.clusters(id) on delete set null,
  channel       public.report_channel not null,

  -- Idempotenza: Telegram (update_id) e Twilio (MessageSid) ritentano.
  -- Senza questo vincolo ogni retry crea un doppione che gonfia i contatori.
  external_id   text,

  raw_text      text not null,   -- PRIVATO: non esce mai da qui
  clean_text    text,            -- riscritto in italiano formale, base dell'embedding
  anon_text     text,            -- l'UNICO testo che può comparire in pagine pubbliche

  raw_media_urls text[] not null default '{}',

  location      geography(Point, 4326),  -- precisione piena, mai esposta
  location_hint text,
  city          text,   -- denormalizzato: senza queste due colonne la RPC di
  neighborhood  text,   -- PLAN.md §4 non compila

  category      text,
  urgency       smallint check (urgency between 1 and 5),
  status        public.report_status not null default 'nuovo',

  is_synthetic       boolean not null default false,
  moderation_flagged boolean not null default false,

  created_at    timestamptz not null default now(),
  triaged_at    timestamptz,

  constraint reports_channel_external_id_key unique (channel, external_id)
);

create index reports_status_created_idx  on public.reports (status, created_at desc);
create index reports_cluster_idx         on public.reports (cluster_id);
create index reports_location_idx        on public.reports using gist (location);
create index reports_category_city_idx   on public.reports (category, city);
create index reports_citizen_created_idx on public.reports (citizen_id, created_at desc);

comment on column public.reports.raw_text is
  'Testo grezzo del cittadino. Non deve MAI raggiungere una view pubblica o una API aperta.';
comment on column public.reports.is_synthetic is
  'Dati di test. Ogni view pubblica lo filtra: un atto costruito su segnalazioni '
  'finte sarebbe il fallimento più grave possibile per questo progetto.';

-- ============================================================================
-- EMBEDDING (tabella separata: i vettori pesano e non servono a ogni query)
-- ============================================================================

create table public.report_embeddings (
  report_id  uuid primary key references public.reports(id) on delete cascade,
  embedding  vector(1536) not null,
  model      text not null default 'text-embedding-3-small',
  created_at timestamptz not null default now()
);

-- HNSW e non IVFFlat: un indice IVFFlat costruito su tabella vuota (com'è qui,
-- alla prima migration) resta inutile finché non lo si ricostruisce dopo il seed.
-- HNSW è incrementale e va bene da zero fino a ben oltre la scala dell'MVP.
create index report_embeddings_hnsw_idx
  on public.report_embeddings using hnsw (embedding vector_cosine_ops);

comment on column public.report_embeddings.model is
  'Cambiare modello di embedding invalida TUTTI i vettori esistenti e richiede '
  'un ri-embedding completo. Questa colonna serve a sapere quali righe migrare.';

-- ============================================================================
-- AZIONI (atti generati)
-- ============================================================================

create table public.actions (
  id                   uuid primary key default gen_random_uuid(),
  cluster_id           uuid not null references public.clusters(id) on delete cascade,
  kind                 public.action_kind not null,
  status               public.action_status not null default 'bozza',
  title                text not null,
  body_markdown        text not null,
  pdf_url              text,
  docx_url             text,
  recipient            text,
  recipient_endpoint_id uuid,
  signatures_count     int not null default 0,
  signatures_target    int not null default 50,

  -- Tracciabilità della revisione umana: senza queste due colonne non è
  -- possibile dimostrare che un atto è stato letto da una persona.
  reviewed_by          text,
  reviewed_at          timestamptz,

  submitted_at         timestamptz,
  response_received_at timestamptz,
  response_text        text,
  is_synthetic         boolean not null default false,
  created_at           timestamptz not null default now(),

  -- Nessun atto raggiunge 'inviata' senza revisione umana tracciata.
  -- Il vincolo è a livello di database di proposito: una regola applicativa
  -- si aggira per sbaglio, un CHECK no.
  constraint actions_review_before_send check (
    status not in ('inviata', 'risposta_ricevuta')
    or (reviewed_by is not null and reviewed_at is not null)
  )
);

create index actions_cluster_idx on public.actions (cluster_id);
create index actions_status_idx  on public.actions (status, created_at desc);

-- ============================================================================
-- FIRME
-- ============================================================================

create table public.signatures (
  id         uuid primary key default gen_random_uuid(),
  action_id  uuid not null references public.actions(id) on delete cascade,
  citizen_id uuid not null references public.citizens(id) on delete cascade,
  signed_at  timestamptz not null default now(),
  ip_hash    text,
  unique (action_id, citizen_id)
);

create index signatures_action_idx on public.signatures (action_id);

-- ============================================================================
-- CONTATTI PA
-- ============================================================================

create table public.pa_endpoints (
  id         uuid primary key default gen_random_uuid(),
  city       text not null,
  role       text not null,   -- sindaco, difensore_civico, procura, trasparenza...
  name       text,
  email      text,
  pec        text,
  address    text,
  source_url text,            -- da dove viene il contatto: va sempre verificabile
  verified_at timestamptz,
  updated_at timestamptz not null default now()
);

create index pa_endpoints_city_role_idx on public.pa_endpoints (city, role);

comment on column public.pa_endpoints.source_url is
  'Fonte ufficiale del contatto (indicepa.gov.it, sito del comune). Una PEC '
  'sbagliata manda un atto nel vuoto o alla persona sbagliata.';

alter table public.actions
  add constraint actions_recipient_endpoint_fkey
  foreign key (recipient_endpoint_id) references public.pa_endpoints(id) on delete set null;
