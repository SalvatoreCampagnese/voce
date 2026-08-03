-- ============================================================================
-- Pagina personale della segnalazione
--
-- Il bot prometteva «puoi seguire tutto qui» e mandava a /le-mie-segnalazioni,
-- che non esiste: ogni cittadino che scriveva finiva su un 404. La promessa era
-- nel messaggio che ricevono TUTTI, quindi il danno era su tutti.
--
-- Una pagina protetta da login non risolverebbe: chi scrive da Telegram non ha
-- un account, e passerebbe da un 404 a una schermata di accesso impossibile.
-- Serve invece un indirizzo che vale solo per quella segnalazione.
--
-- Il token viene da `gen_random_uuid()` senza trattini: 32 caratteri esadecimali,
-- 122 bit di casualità crittografica. Non si indovina e non si enumera.
-- Chi ha il link vede lo stato della PROPRIA segnalazione — nessun dato di
-- altri, nessun elenco, nessuna identità. Il link glielo mandiamo solo a lui,
-- sul canale da cui ha scritto.
--
-- PERCHÉ NON `gen_random_bytes`, che sarebbe la scelta ovvia:
-- appartiene a pgcrypto, e pgcrypto NON sta nello stesso schema ovunque. In
-- locale `create extension` lo mette in `public`; su Supabase cloud è
-- preinstallato in `extensions`, fuori dal search_path delle migration. Il
-- risultato è una migration che passa in locale e fallisce in produzione con
-- «function gen_random_bytes(integer) does not exist».
-- `gen_random_uuid()` è invece nel core di Postgres dalla 13: c'è sempre,
-- in qualunque schema si trovi pgcrypto.
-- ============================================================================

alter table public.reports
  add column public_token text unique
  default replace(gen_random_uuid()::text, '-', '');

-- Le segnalazioni già esistenti ne ricevono uno adesso.
update public.reports
   set public_token = replace(gen_random_uuid()::text, '-', '')
 where public_token is null;

alter table public.reports alter column public_token set not null;

comment on column public.reports.public_token is
  'Chiave del link personale mandato al cittadino. Non è un segreto di sistema: '
  'dà accesso in sola lettura allo stato di UNA segnalazione, la sua.';

-- ---------------------------------------------------------------------------
-- Stato di una segnalazione, dato il token
--
-- SECURITY DEFINER perché `reports` è privata e chi guarda non ha sessione.
-- Restituisce solo campi sicuri: niente raw_text, niente coordinate precise,
-- niente identità. Il testo mostrato è `anon_text`, lo stesso che finirebbe in
-- pagina pubblica — così anche un link inoltrato per sbaglio non espone più di
-- quanto sia già pubblico.
-- ---------------------------------------------------------------------------

create or replace function public.get_report_status(token text)
returns table (
  status              public.report_status,
  category            text,
  urgency             smallint,
  citta               text,
  quartiere           text,
  anon_text           text,
  created_at          timestamptz,
  cluster_id          uuid,
  cluster_title       text,
  cluster_status      public.cluster_status,
  cluster_citizens    int,
  cluster_reports     int,
  cluster_is_public   boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.status,
         r.category,
         r.urgency,
         r.city,
         r.neighborhood,
         r.anon_text,
         date_trunc('minute', r.created_at) as created_at,
         c.id,
         c.title,
         c.status,
         c.citizens_count,
         c.reports_count,
         coalesce(c.citizens_count >= public.config_int('min_public_citizens'), false)
    from public.reports r
    left join public.clusters c on c.id = r.cluster_id
   where r.public_token = token
     and r.is_synthetic = false
   limit 1;
$$;

revoke all on function public.get_report_status(text) from public;
grant execute on function public.get_report_status(text) to anon, authenticated, service_role;
