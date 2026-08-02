-- ============================================================================
-- VOCE — Row Level Security
--
-- Principio: le segnalazioni e le identità sono private, l'output civico
-- (gruppi e atti) è pubblico. Non esiste una terza categoria.
--
-- Tutte le policy confrontano citizens.auth_user_id con auth.uid(), MAI
-- citizens.id: chi scrive dai bot non ha un account, e in PLAN.md §4 le policy
-- usavano `citizen_id = auth.uid()` su una tabella dove i due valori non hanno
-- alcun rapporto — nessuno avrebbe mai letto le proprie segnalazioni.
--
-- `(select auth.uid())` invece di `auth.uid()`: Postgres valuta la subquery una
-- volta per statement invece che una volta per riga. Su una tabella di
-- segnalazioni è la differenza tra una query istantanea e una lenta.
-- ============================================================================

alter table public.citizens          enable row level security;
alter table public.reports           enable row level security;
alter table public.report_embeddings enable row level security;
alter table public.clusters          enable row level security;
alter table public.actions           enable row level security;
alter table public.signatures        enable row level security;
alter table public.pa_endpoints      enable row level security;

-- Helper: il citizen_id della sessione corrente.
create or replace function public.current_citizen_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id from public.citizens where auth_user_id = (select auth.uid());
$$;

-- ============================================================================
-- CITTADINI — ognuno vede e modifica solo se stesso
-- Test: come utente A, `select * from citizens` deve tornare 1 riga (la sua).
-- ============================================================================

create policy citizen_self_read on public.citizens
  for select to authenticated
  using (auth_user_id = (select auth.uid()));

create policy citizen_self_update on public.citizens
  for update to authenticated
  using (auth_user_id = (select auth.uid()))
  with check (auth_user_id = (select auth.uid()));

-- Nessuna policy di INSERT/DELETE per gli utenti: la creazione di un cittadino
-- passa dai webhook (service role) e la cancellazione da delete_citizen_account.

-- ============================================================================
-- SEGNALAZIONI — private, sempre
-- Test: come utente A, `select * from reports` non deve restituire nessuna
-- riga il cui citizen_id appartenga a B.
-- ============================================================================

create policy report_owner_read on public.reports
  for select to authenticated
  using (citizen_id = public.current_citizen_id());

create policy report_owner_insert on public.reports
  for insert to authenticated
  with check (citizen_id = public.current_citizen_id());

-- Nessun UPDATE e nessun DELETE per gli utenti: una segnalazione è un fatto
-- storico. La rimozione passa da delete_citizen_account, che sa distinguere il
-- caso in cui il contributo è già confluito in un atto protocollato.

-- ============================================================================
-- EMBEDDING — nessun accesso dai client.
-- RLS attiva senza policy = tabella invisibile a chiunque non sia service role.
-- Un embedding è una rappresentazione del testo: da un vettore si ricostruisce
-- molto più di quanto sembri.
-- ============================================================================

-- (nessuna policy, intenzionalmente)

-- ============================================================================
-- GRUPPI — lettura pubblica sopra la soglia di privacy
--
-- La lettura diretta della tabella è consentita solo per i gruppi già pubblici.
-- Le pagine usano comunque la vista public_clusters, che filtra anche le
-- colonne; questa policy è la seconda barriera nel caso qualcuno interroghi la
-- tabella direttamente via PostgREST.
-- ============================================================================

create policy cluster_public_read on public.clusters
  for select to anon, authenticated
  using (is_synthetic = false and citizens_count >= 3);

-- ============================================================================
-- ATTI — lettura pubblica: sono l'output civico, devono essere ispezionabili
-- ============================================================================

create policy action_public_read on public.actions
  for select to anon, authenticated
  using (is_synthetic = false);

-- Nessun INSERT/UPDATE dai client: gli atti li genera il server e li promuove
-- una persona. Il CHECK actions_review_before_send è la barriera finale.

-- ============================================================================
-- FIRME — il cittadino vede e crea solo le proprie.
-- Il conteggio pubblico NON passa da qui: sta su actions.signatures_count,
-- mantenuto dal trigger. Una view che contasse questa tabella leggerebbe solo
-- le firme dell'utente corrente.
-- ============================================================================

create policy signature_own_read on public.signatures
  for select to authenticated
  using (citizen_id = public.current_citizen_id());

create policy signature_own_insert on public.signatures
  for insert to authenticated
  with check (citizen_id = public.current_citizen_id());

-- Revoca della propria firma: è un atto di volontà, deve essere reversibile.
create policy signature_own_delete on public.signatures
  for delete to authenticated
  using (citizen_id = public.current_citizen_id());

-- ============================================================================
-- CONTATTI PA — pubblici in lettura: sapere a chi è stato mandato un atto fa
-- parte della trasparenza.
-- ============================================================================

create policy pa_endpoints_public_read on public.pa_endpoints
  for select to anon, authenticated
  using (true);

-- ============================================================================
-- PERMESSI SULLE FUNZIONI
--
-- ATTENZIONE — il tranello di Postgres che è costato una falla in questo file:
-- ogni funzione nasce con EXECUTE concesso a PUBLIC. Revocare da `anon` e
-- `authenticated` NON serve a niente finché il grant a PUBLIC resta, perché i
-- ruoli lo ereditano. E in Supabase ogni funzione dello schema `public` è
-- esposta come RPC HTTP: una security definer lasciata a PUBLIC è raggiungibile
-- da chiunque su internet, senza token.
--
-- Verificato con:
--   select proname, proacl from pg_proc where pronamespace='public'::regnamespace;
-- Un ACL che inizia con `=X/postgres` significa "PUBLIC può eseguire".
--
-- Regola: revoca sempre da PUBLIC, poi concedi al ruolo minimo necessario.
-- ============================================================================

-- Il cittadino può cancellare il proprio account, e solo il proprio.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := public.current_citizen_id();
begin
  if me is null then
    raise exception 'nessun cittadino collegato a questa sessione';
  end if;
  perform public.delete_citizen_account(me);
end;
$$;

-- --- Funzioni riservate al server (service role) --------------------------
-- match_similar_reports è security definer e legge TUTTE le segnalazioni
-- scavalcando la RLS: restituisce il legame report ↔ cittadino. Esposta ad anon
-- permetterebbe di ricostruire chi ha segnalato cosa.
revoke all on function public.match_similar_reports(vector, float, int, text, text, text)
  from public, anon, authenticated;
grant execute on function public.match_similar_reports(vector, float, int, text, text, text)
  to service_role;

-- delete_citizen_account accetta un uuid arbitrario: esposta, cancellerebbe
-- l'account di chiunque. Solo il server, e solo tramite delete_my_account().
revoke all on function public.delete_citizen_account(uuid) from public, anon, authenticated;
grant execute on function public.delete_citizen_account(uuid) to service_role;

revoke all on function public.refresh_cluster_counters(uuid) from public, anon, authenticated;
grant execute on function public.refresh_cluster_counters(uuid) to service_role;

revoke all on function public.count_recent_reports(uuid, int) from public, anon, authenticated;
grant execute on function public.count_recent_reports(uuid, int) to service_role;

-- --- Funzioni per l'utente autenticato ------------------------------------
-- Agiscono solo sulla sessione corrente: non accettano un identificativo altrui.
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

revoke all on function public.current_citizen_id() from public, anon;
grant execute on function public.current_citizen_id() to authenticated, service_role;

-- --- Funzioni pubbliche ----------------------------------------------------
-- Matematica pura su un input fornito dal chiamante: nessun accesso a dati.
revoke all on function public.blur_point(geography, int) from public;
grant execute on function public.blur_point(geography, int) to anon, authenticated, service_role;
