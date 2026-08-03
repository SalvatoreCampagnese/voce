-- ============================================================================
-- Parametri di piattaforma lato database
--
-- Perché esiste questa tabella.
-- Due soglie vivevano scritte a mano in sette punti del SQL: la soglia di
-- pubblicazione di un gruppo (`citizens_count >= 3`) e il raggio di
-- arrotondamento delle coordinate (`blur_point(..., 300)`). Sono soglie di
-- PRIVACY, non di prodotto: se qualcuno le cambia lato applicazione pensando di
-- averle cambiate ovunque, il database continua a decidere per conto suo e la
-- divergenza non si vede finché non espone qualcuno.
--
-- Da qui in avanti il database ha una sola fonte di verità, e l'applicazione
-- verifica di essere d'accordo con lei (vedi /api/health).
--
-- Nota di sicurezza: questi valori NON sono modificabili da anon o da un utente
-- autenticato. La tabella ha RLS senza policy — è invisibile a chiunque non sia
-- service role. Abbassare `min_public_citizens` significa esporre le persone:
-- deve restare un gesto deliberato di chi amministra, non una chiamata API.
-- ============================================================================

create table public.app_config (
  key         text primary key,
  value_int   int not null,
  description text not null,
  updated_at  timestamptz not null default now()
);

alter table public.app_config enable row level security;
-- Nessuna policy: solo service role e postgres la vedono.

insert into public.app_config (key, value_int, description) values
  ('min_public_citizens', 3,
   'Cittadini distinti necessari perché un gruppo diventi visibile al pubblico. '
   'Sotto questa soglia, mostrare un gruppo equivale a indicare chi ha parlato.'),
  ('geo_blur_meters', 300,
   'Raggio di arrotondamento delle coordinate esposte pubblicamente, in metri.');

-- ---------------------------------------------------------------------------
-- Lettore dei parametri
--
-- STABLE: il planner la valuta una volta per query invece che per riga, quindi
-- si può usare dentro le viste senza pagarla su ogni tupla.
-- SECURITY DEFINER: legge una tabella che nessun ruolo applicativo può vedere.
-- ---------------------------------------------------------------------------

create or replace function public.config_int(config_key text)
returns int
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  valore int;
begin
  select value_int into valore from public.app_config where key = config_key;

  if valore is null then
    -- Meglio fermarsi che proseguire con un valore implicito: un parametro di
    -- privacy assente non deve mai degradare in "nessun limite".
    raise exception 'parametro di configurazione mancante: %', config_key;
  end if;

  return valore;
end;
$$;

revoke all on function public.config_int(text) from public;
-- anon e authenticated devono poterla eseguire: la policy RLS su `clusters`
-- viene valutata con i loro privilegi.
grant execute on function public.config_int(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- blur_point ora prende il raggio dalla configurazione
-- ---------------------------------------------------------------------------

create or replace function public.blur_point(p geography, meters int default null)
returns geography
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  passo        int;
  lat          double precision;
  lng          double precision;
  lat_step     double precision;
  lng_step     double precision;
  blurred_lat  double precision;
  blurred_lng  double precision;
begin
  if p is null then
    return null;
  end if;

  passo := coalesce(meters, public.config_int('geo_blur_meters'));

  lat := ST_Y(p::geometry);
  lng := ST_X(p::geometry);

  lat_step    := passo / 111320.0;
  blurred_lat := round((lat / lat_step)::numeric)::double precision * lat_step;

  -- Il passo in longitudine si calcola sulla latitudine GIÀ arrotondata,
  -- altrimenti due punti della stessa cella finirebbero in celle diverse.
  lng_step    := passo / (111320.0 * cos(radians(blurred_lat)));
  blurred_lng := round((lng / lng_step)::numeric)::double precision * lng_step;

  return ST_SetSRID(ST_MakePoint(blurred_lng, blurred_lat), 4326)::geography;
end;
$$;

-- ---------------------------------------------------------------------------
-- Viste e policy: via i numeri scritti a mano
-- ---------------------------------------------------------------------------

drop view if exists public.public_platform_stats;
drop view if exists public.public_city_stats;
drop view if exists public.public_cluster_reports;
drop view if exists public.public_actions;
drop view if exists public.public_clusters;

create view public.public_clusters as
  select c.id,
         c.title,
         c.summary,
         c.category,
         c.city,
         c.neighborhood,
         c.reports_count,
         c.citizens_count,
         c.status,
         public.blur_point(c.centroid) as centroid,
         c.radius_meters,
         c.threshold_reached_at,
         date_trunc('hour', c.created_at) as created_at,
         date_trunc('hour', c.updated_at) as updated_at
    from public.clusters c
   where c.is_synthetic = false
     and c.citizens_count >= public.config_int('min_public_citizens');

create view public.public_cluster_reports as
  select r.id,
         r.cluster_id,
         r.category,
         r.urgency,
         r.anon_text,
         public.blur_point(r.location) as location,
         date_trunc('day', r.created_at) as created_at
    from public.reports r
    join public.clusters c on c.id = r.cluster_id
   where r.is_synthetic = false
     and r.anon_text is not null
     and r.status = 'clustered'
     and c.is_synthetic = false
     and c.citizens_count >= public.config_int('min_public_citizens');

create view public.public_actions as
  select a.id,
         a.cluster_id,
         a.kind,
         a.status,
         a.title,
         a.body_markdown,
         a.pdf_url,
         a.docx_url,
         a.recipient,
         a.signatures_count,
         a.signatures_target,
         a.reviewed_by,
         a.submitted_at,
         a.response_received_at,
         a.response_text,
         date_trunc('hour', a.created_at) as created_at
    from public.actions a
    join public.clusters c on c.id = a.cluster_id
   where a.is_synthetic = false
     and c.is_synthetic = false;

create view public.public_city_stats as
  select c.city,
         count(distinct c.id)                                          as clusters_count,
         sum(c.reports_count)                                          as reports_count,
         sum(c.citizens_count)                                         as citizens_count,
         count(distinct a.id) filter (where a.status = 'inviata')      as actions_sent,
         count(distinct a.id) filter (where a.response_received_at is not null) as responses_received
    from public.clusters c
    left join public.actions a on a.cluster_id = c.id and a.is_synthetic = false
   where c.is_synthetic = false
     and c.citizens_count >= public.config_int('min_public_citizens')
   group by c.city;

create view public.public_platform_stats as
  select
    (
      select count(distinct r.citizen_id)::int
        from public.reports r
       where r.is_synthetic = false
         and r.citizen_id is not null
    ) as citizens_count,
    (
      select count(*)::int
        from public.reports r
       where r.is_synthetic = false
    ) as reports_count,
    (
      select count(*)::int
        from public.clusters c
       where c.is_synthetic = false
         and c.citizens_count >= public.config_int('min_public_citizens')
    ) as clusters_count,
    (
      select count(*)::int
        from public.actions a
       where a.is_synthetic = false
         and a.status in ('inviata', 'risposta_ricevuta')
    ) as actions_sent,
    (
      select count(*)::int
        from public.actions a
       where a.is_synthetic = false
         and a.response_received_at is not null
    ) as responses_received;

grant select on public.public_clusters,
                public.public_cluster_reports,
                public.public_actions,
                public.public_city_stats,
                public.public_platform_stats
  to anon, authenticated;

-- La policy RLS su clusters usava anch'essa il 3 scritto a mano.
drop policy if exists cluster_public_read on public.clusters;
create policy cluster_public_read on public.clusters
  for select to anon, authenticated
  using (
    is_synthetic = false
    and citizens_count >= public.config_int('min_public_citizens')
  );

-- ---------------------------------------------------------------------------
-- Lettura dei parametri per l'applicazione
--
-- Serve al controllo di salute: l'app deve poter verificare che le proprie
-- soglie coincidano con quelle del database, invece di dare per scontato che
-- qualcuno abbia aggiornato entrambi.
-- ---------------------------------------------------------------------------

create or replace function public.get_privacy_config()
returns table (key text, value_int int)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select key, value_int
    from public.app_config
   where key in ('min_public_citizens', 'geo_blur_meters');
$$;

revoke all on function public.get_privacy_config() from public, anon, authenticated;
grant execute on function public.get_privacy_config() to service_role;
