-- ============================================================================
-- Confronto dei luoghi su una chiave normalizzata
--
-- IL GUASTO, visto su dati veri. Venti segnalazioni dello stesso paese, nessun
-- gruppo. La colonna `city` conteneva:
--
--     Castel San Pietro Terme
--     castel san pietro terme
--     castel san pietro
--     NULL
--
-- e `match_similar_reports` filtrava con `r.city = filter_city`, cioè
-- uguaglianza esatta e sensibile alle maiuscole. Quattro secchi separati che
-- non si vedevano fra loro: nessuno raggiungeva MIN_REPORTS_NEW_CLUSTER, e il
-- cron rispondeva `gruppiCreati: 0` senza che niente dicesse perché. È il
-- fallimento peggiore per questo progetto — vicini che hanno lo stesso problema
-- e non si incontrano — travestito da esito normale.
--
-- Il valore non è colpa di nessuno: `city` lo scrive un modello a partire da
-- come una persona ha nominato il proprio paese, e ogni cittadino porta la sua
-- grafia. Chiedere al prompt di essere coerente è una speranza, non un vincolo.
--
-- LA CORREZIONE. Si continua a SALVARE quello che il modello ha scritto — è il
-- testo che comparirà in pagina — e si CONFRONTA su una forma canonica.
-- Display e confronto sono due cose diverse e da qui in poi lo restano.
--
-- QUELLO CHE LA CHIAVE FA, e sono tutte trasformazioni deterministiche e
-- reversibili nel senso che contano: minuscole, spazi ripetuti, accenti
-- italiani, sigla di provincia in coda («Milano (MI)» → «milano»).
--
-- QUELLO CHE NON FA, di proposito: non avvicina nomi che differiscono davvero.
-- «Castel San Pietro» resta distinto da «Castel San Pietro Terme». La tentazione
-- è usare la somiglianza fra stringhe, e va scartata: «Castel San Pietro Romano»
-- (RM) e «Castel San Pietro Terme» (BO) si somigliano per oltre due terzi, e
-- unirli manderebbe un esposto alla Procura sbagliata. Meglio una segnalazione
-- che resta fuori da un gruppo che un atto indirizzato a un'altra provincia.
-- La soluzione definitiva è un elenco ISTAT dei comuni, non una soglia.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- La funzione
--
-- IMMUTABLE è obbligatorio, non decorativo: senza, non può stare dentro una
-- colonna generata. Per questo gli accenti si tolgono con `translate` e non con
-- `unaccent`, che dipende da un dizionario ed è soltanto STABLE.
--
-- ATTENZIONE A MODIFICARLA: le colonne generate qui sotto contengono valori già
-- calcolati con questa versione. Cambiare la funzione NON li ricalcola, e da
-- quel momento righe vecchie e nuove smettono di confrontarsi fra loro — cioè
-- si riapre esattamente il guasto che questa migrazione chiude. Se la cambi,
-- nella stessa migrazione forza il ricalcolo con
-- `alter table public.reports alter column city_key drop expression, ...`
-- oppure ricrea le colonne.
-- ---------------------------------------------------------------------------

create or replace function public.chiave_luogo(valore text)
returns text
language sql
immutable
parallel safe
as $$
  select nullif(
    regexp_replace(
      translate(
        lower(
          -- Sigla di provincia in coda: «Milano (MI)», «Castel San Pietro (BO)».
          -- Il prompt la vieta, i modelli ogni tanto la scrivono lo stesso.
          regexp_replace(btrim(coalesce(valore, '')), '\s*\([^)]*\)\s*$', '')
        ),
        'àáâãäèéêëìíîïòóôõöùúûüçñ',
        'aaaaaeeeeiiiiooooouuuucn'
      ),
      -- Spazi ripetuti, tabulazioni, a capo: «Castel  San Pietro» = «Castel San Pietro».
      '\s+', ' ', 'g'
    ),
    ''
  );
$$;

comment on function public.chiave_luogo is
  'Forma canonica di un nome di luogo, per il solo CONFRONTO: minuscole, '
  'accenti italiani, spazi ripetuti, sigla di provincia in coda. Non avvicina '
  'nomi diversi: «Castel San Pietro» resta distinto da «Castel San Pietro '
  'Terme», perché unire due comuni omonimi manderebbe un atto alla Procura '
  'sbagliata. Il valore da mostrare resta la colonna originale.';

-- ---------------------------------------------------------------------------
-- Le colonne
--
-- Generate e memorizzate: si ricalcolano da sole a ogni scrittura, e le righe
-- già in tabella vengono riempite adesso dall'ALTER. Nessun backfill da
-- ricordarsi, nessuna colonna che resta indietro perché un percorso di codice
-- ha dimenticato di aggiornarla.
-- ---------------------------------------------------------------------------

alter table public.reports
  add column if not exists city_key text
    generated always as (public.chiave_luogo(city)) stored,
  add column if not exists neighborhood_key text
    generated always as (public.chiave_luogo(neighborhood)) stored;

comment on column public.reports.city_key is
  'Forma canonica di `city`, usata da match_similar_reports per il confronto. '
  'Non mostrarla mai: il valore da leggere è `city`.';

comment on column public.reports.neighborhood_key is
  'Come city_key, per il quartiere. Stesso guasto, stessa correzione: '
  '«Corvetto» e «corvetto» erano due zone diverse.';

-- L'indice serve al filtro della RPC, che ora confronta su queste colonne.
create index if not exists reports_city_key_idx
  on public.reports (city_key, neighborhood_key, category);

-- ---------------------------------------------------------------------------
-- La RPC
--
-- Unica modifica rispetto a 0002: i due filtri di luogo passano dalla chiave.
-- Il resto — soglia, esclusione della quarantena, ordinamento, limite — è
-- identico e va lasciato tale: questa funzione decide chi finisce in un gruppo,
-- e un cambiamento non voluto qui si vede solo mesi dopo, in un atto.
--
-- I parametri restano `filter_city`/`filter_neighborhood` con il nome di prima:
-- chi chiama continua a passare il nome così com'è, e la normalizzazione
-- avviene qui. Chiedere ai chiamanti di normalizzare significherebbe che il
-- giorno in cui uno se ne dimentica il guasto torna, silenzioso come prima.
-- ---------------------------------------------------------------------------

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
     and (filter_city is null
          or r.city_key = public.chiave_luogo(filter_city))
     and (filter_neighborhood is null
          or r.neighborhood_key = public.chiave_luogo(filter_neighborhood))
     and (filter_category is null     or r.category = filter_category)
   order by e.embedding <=> query_embedding
   limit match_count;
$$;

comment on function public.match_similar_reports is
  'La similarità semantica da sola non basta: due segnalazioni di "buche in '
  'strada" in quartieri diversi non sono lo stesso problema. Chiamare sempre '
  'con i filtri di città/quartiere e categoria. Il confronto sul luogo passa '
  'da chiave_luogo(): «Castel San Pietro Terme» e «castel san pietro terme» '
  'sono lo stesso paese, e per mesi non lo sono stati.';

-- I permessi si riscrivono perché CREATE OR REPLACE non li tocca, ma una
-- futura DROP + CREATE sì, e questa riga è ciò che rende la migrazione
-- rieseguibile senza lasciare la funzione irraggiungibile ad anon.
revoke all on function public.match_similar_reports(vector, float, int, text, text, text)
  from public, anon;
grant execute on function public.match_similar_reports(vector, float, int, text, text, text)
  to authenticated, service_role;
