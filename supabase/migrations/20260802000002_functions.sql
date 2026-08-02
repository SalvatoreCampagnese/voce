-- ============================================================================
-- VOCE — funzioni, trigger e viste pubbliche
-- ============================================================================

-- ============================================================================
-- GEOGRAFIA: arrotondamento delle coordinate
--
-- Arrotondamento a griglia deterministico, non rumore casuale: con il rumore,
-- chi interroga più volte lo stesso punto ne fa la media e ricostruisce la
-- posizione vera. Con la griglia, due letture dello stesso punto danno sempre
-- la stessa cella.
-- ============================================================================

create or replace function public.blur_point(p geography, meters int default 300)
returns geography
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
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

  lat := ST_Y(p::geometry);
  lng := ST_X(p::geometry);

  lat_step    := meters / 111320.0;
  blurred_lat := round((lat / lat_step)::numeric)::double precision * lat_step;

  -- Il passo in longitudine si calcola sulla latitudine GIÀ arrotondata,
  -- altrimenti due punti della stessa cella finirebbero in celle diverse.
  lng_step    := meters / (111320.0 * cos(radians(blurred_lat)));
  blurred_lng := round((lng / lng_step)::numeric)::double precision * lng_step;

  return ST_SetSRID(ST_MakePoint(blurred_lng, blurred_lat), 4326)::geography;
end;
$$;

comment on function public.blur_point is
  'Arrotonda una coordinata a una griglia di N metri (default 300). '
  'Ogni esposizione pubblica di una posizione passa da qui.';

-- ============================================================================
-- CONTATORI DEI GRUPPI
--
-- PLAN.md §4 esegue due subquery per ogni riga modificata. Qui il ricalcolo
-- avviene una volta sola per gruppo interessato, con una sola scansione.
-- ============================================================================

create or replace function public.refresh_cluster_counters(target uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.clusters c
     set reports_count  = coalesce(s.n_reports, 0),
         citizens_count = coalesce(s.n_citizens, 0),
         updated_at     = now()
    from (
      select count(*)                   as n_reports,
             count(distinct citizen_id) as n_citizens
        from public.reports
       where cluster_id = target
    ) s
   where c.id = target;
$$;

create or replace function public.on_reports_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Gruppo di destinazione
  if tg_op in ('INSERT', 'UPDATE') and new.cluster_id is not null then
    perform public.refresh_cluster_counters(new.cluster_id);
  end if;

  -- Gruppo di provenienza, se la segnalazione è stata spostata o cancellata
  if tg_op in ('UPDATE', 'DELETE') and old.cluster_id is not null
     and (tg_op = 'DELETE' or old.cluster_id is distinct from new.cluster_id) then
    perform public.refresh_cluster_counters(old.cluster_id);
  end if;

  return coalesce(new, old);
end;
$$;

create trigger reports_after_change
  after insert or update of cluster_id, citizen_id or delete on public.reports
  for each row execute function public.on_reports_change();

-- ============================================================================
-- CONTATORE DELLE FIRME
--
-- Mantenuto su actions.signatures_count da trigger, NON da una view che legge
-- signatures: signatures ha RLS privata, quindi una view normale conterebbe
-- solo le firme dell'utente corrente e il contatore pubblico leggerebbe 1 (o 0).
-- ============================================================================

create or replace function public.on_signatures_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target uuid := coalesce(new.action_id, old.action_id);
begin
  update public.actions a
     set signatures_count = (
           select count(*) from public.signatures where action_id = target
         )
   where a.id = target;
  return coalesce(new, old);
end;
$$;

create trigger signatures_after_change
  after insert or delete on public.signatures
  for each row execute function public.on_signatures_change();

-- ============================================================================
-- RICERCA VETTORIALE
--
-- Versione corretta della RPC di PLAN.md §4: lì filtrava su r.city e
-- r.neighborhood, colonne che su reports non esistevano.
-- ============================================================================

create or replace function public.match_similar_reports(
  query_embedding     vector(1536),
  match_threshold     float default 0.82,
  match_count         int default 20,
  filter_city         text default null,
  filter_neighborhood text default null,
  filter_category     text default null
)
returns table (
  report_id  uuid,
  cluster_id uuid,
  citizen_id uuid,
  similarity float
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id,
         r.cluster_id,
         r.citizen_id,
         1 - (e.embedding <=> query_embedding) as similarity
    from public.report_embeddings e
    join public.reports r on r.id = e.report_id
   where 1 - (e.embedding <=> query_embedding) > match_threshold
     and r.status <> 'quarantena'
     and (filter_city is null         or r.city = filter_city)
     and (filter_neighborhood is null or r.neighborhood = filter_neighborhood)
     and (filter_category is null     or r.category = filter_category)
   order by e.embedding <=> query_embedding
   limit match_count;
$$;

comment on function public.match_similar_reports is
  'La similarità semantica da sola non basta: due segnalazioni di "buche in strada" '
  'in quartieri diversi non sono lo stesso problema. Chiamare sempre con i filtri '
  'di città/quartiere e categoria.';

-- ============================================================================
-- RATE LIMIT
-- ============================================================================

create or replace function public.count_recent_reports(
  target_citizen uuid,
  window_minutes int default 60
)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::int
    from public.reports
   where citizen_id = target_citizen
     and is_synthetic = false
     and created_at > now() - make_interval(mins => window_minutes);
$$;

-- ============================================================================
-- DIRITTO ALL'OBLIO
--
-- Cancellare a cascata è sbagliato quando un report è già confluito in un atto
-- INVIATO: quell'atto è un documento protocollato e i suoi fatti non si
-- riscrivono. Si anonimizza il legame invece di distruggere il documento.
-- ============================================================================

create or replace function public.delete_citizen_account(target uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  has_submitted_actions boolean;
begin
  select exists (
    select 1
      from public.reports r
      join public.actions a on a.cluster_id = r.cluster_id
     where r.citizen_id = target
       and a.status in ('inviata', 'risposta_ricevuta')
  ) into has_submitted_actions;

  if has_submitted_actions then
    -- Il contributo resta nei gruppi in forma anonima; l'identità sparisce.
    update public.reports
       set raw_text     = '[segnalazione rimossa su richiesta del cittadino]',
           clean_text   = null,
           location     = null,
           location_hint = null,
           raw_media_urls = '{}'
     where citizen_id = target;

    delete from public.report_embeddings
     where report_id in (select id from public.reports where citizen_id = target);
  end if;

  -- Le firme si cancellano sempre: una firma è un atto di volontà revocabile.
  delete from public.signatures where citizen_id = target;

  -- Il cittadino sparisce. Se non c'erano atti inviati, i suoi report cadono
  -- in cascata; se c'erano, restano orfani ma già anonimizzati sopra.
  if has_submitted_actions then
    update public.reports set citizen_id = null where citizen_id = target;
  end if;

  delete from public.citizens where id = target;
end;
$$;

-- ============================================================================
-- VISTE PUBBLICHE
--
-- Sono l'unica superficie che legge dati aggregati senza sessione.
-- security_invoker = false (default): girano con i privilegi del proprietario e
-- quindi scavalcano la RLS delle tabelle sottostanti. È intenzionale, ed è
-- esattamente per questo che ogni colonna qui sotto è stata scelta a mano:
-- niente raw_text, niente location precisa, niente identità.
-- ============================================================================

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
         public.blur_point(c.centroid, 300) as centroid,
         c.radius_meters,
         c.threshold_reached_at,
         date_trunc('hour', c.created_at) as created_at,
         date_trunc('hour', c.updated_at) as updated_at
    from public.clusters c
   where c.is_synthetic = false
     -- Soglia di privacy: un gruppo con una o due segnalazioni in una via corta
     -- identifica chi le ha scritte anche senza nomi.
     and c.citizens_count >= 3;

create view public.public_cluster_reports as
  select r.id,
         r.cluster_id,
         r.category,
         r.urgency,
         r.anon_text,
         public.blur_point(r.location, 300) as location,
         -- Data senza orario: un timestamp al secondo permette di correlare
         -- una segnalazione con chi era in quel posto in quel momento.
         date_trunc('day', r.created_at) as created_at
    from public.reports r
    join public.clusters c on c.id = r.cluster_id
   where r.is_synthetic = false
     and r.anon_text is not null
     and r.status = 'clustered'
     and c.is_synthetic = false
     and c.citizens_count >= 3;

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

-- Statistiche per comune, per la pagina /trasparenza
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
     and c.citizens_count >= 3
   group by c.city;

grant select on public.public_clusters,
                public.public_cluster_reports,
                public.public_actions,
                public.public_city_stats
  to anon, authenticated;
