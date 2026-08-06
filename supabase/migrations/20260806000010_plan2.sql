-- ============================================================================
-- VOCE — PLAN2: notifiche, moderazione, media, scadenzario, risposte della PA,
--               brigading, amministrazione, ricerca semantica pubblica.
--               In coda (§14-§16): le colonne che rendono verificabile
--               l'anonimizzazione doppia, il diritto all'oblio esteso ai media,
--               e la chiusura delle letture dirette che 0003 lasciava aperte
--               ad anon su `actions` e `clusters`.
--
-- Una sola migrazione perché tutti questi oggetti si reggono a vicenda: lo
-- scadenzario senza notifiche è un contatore che nessuno legge, le risposte
-- della PA senza il confronto fra comuni sono dati che nessuno usa, la
-- moderazione senza un pannello di revisione è uno stato che nessuno svuota.
-- E le tre sezioni in coda stanno qui e non in una migrazione successiva
-- perché sono il prezzo di ciò che questa introduce: chi aggiunge i vocali
-- deve, nello stesso gesto, insegnare alla cancellazione dell'account a
-- cancellarli.
--
-- Disciplina rispettata riga per riga, come nelle migrazioni precedenti:
--   · RLS attiva su OGNI tabella nuova, senza eccezioni;
--   · ogni funzione nasce con EXECUTE a PUBLIC e va SEMPRE revocata prima di
--     concedere al ruolo minimo (vedi la nota in 0003_rls.sql: è già costato
--     una falla, perché in Supabase ogni funzione di `public` è una RPC HTTP);
--   · le viste pubbliche mostrano solo anon_text, coordinate via blur_point(),
--     date troncate, e filtrano is_synthetic = false più la soglia
--     public.config_int('min_public_citizens');
--   · gen_random_uuid(), mai gen_random_bytes (pgcrypto vive in schemi diversi
--     fra locale e cloud, vedi la nota in 0007);
--   · niente indebolimento di actions_review_before_send.
--
-- Idempotente: tipi creati con guardia sul catalogo, colonne con
-- `add column if not exists`, indici con `if not exists`, policy precedute da
-- `drop policy if exists`, viste da `drop view if exists`.
-- ============================================================================


-- ============================================================================
-- 1. NOTIFICHE (PLAN2 §1.1) — il debito più grave verso i cittadini
--
-- Il bot risponde a chiunque scriva: «Ti scrivo appena diventa parte di
-- un'azione collettiva». Non esiste una riga di codice che mandi quel
-- messaggio. Una persona segnala, aspetta, e non riceve mai niente — nemmeno
-- quando il suo gruppo si forma davvero e un atto parte a suo nome.
--
-- Non è una funzione mancante: è una promessa scritta nel messaggio che
-- ricevono TUTTI, quindi il danno è su tutti. Chi si è fidato una volta e non
-- ha avuto risposta non torna, e non lo dice a nessuno.
--
-- Questa tabella non manda notifiche: rende la promessa MANTENIBILE, cioè
-- verificabile. Ogni invio lascia una riga, e una riga già presente impedisce
-- il secondo invio. Il cuore è `dedupe_key`: un job che gira due volte (un
-- retry di Vercel, un cron sovrapposto, un deploy a metà esecuzione) non deve
-- scrivere due volte. Ricevere la stessa notifica due volte fa disiscrivere, e
-- disiscriversi da VOCE significa sparire dal proprio quartiere.
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
     where t.typname = 'notification_kind' and n.nspname = 'public'
  ) then
    create type public.notification_kind as enum (
      'gruppo_formato',      -- la tua segnalazione si è unita ad altre
      'gruppo_pubblico',     -- il gruppo ha superato la soglia ed è visibile
      'atto_preparato',      -- esiste una bozza di atto, in attesa di revisione
      'pa_ha_risposto',      -- è arrivata una risposta, classificata e confermata
      'scadenza_meta',       -- metà del termine di legge, ancora nessuna risposta
      'scadenza_raggiunta',  -- il termine scade oggi
      'scadenza_superata'    -- il termine è scaduto: si prepara l'atto di seguito
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
     where t.typname = 'notification_channel' and n.nspname = 'public'
  ) then
    create type public.notification_channel as enum ('telegram', 'email', 'whatsapp');
  end if;
end
$$;

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),

  -- on delete cascade e non set null: una notifica senza destinatario non è un
  -- dato storico, è spazzatura che rischia solo di essere rispedita a qualcuno.
  citizen_id  uuid not null references public.citizens(id) on delete cascade,

  channel     public.notification_channel not null,
  kind        public.notification_kind not null,

  -- Contesto: a cosa si riferisce l'avviso. Tutti nullable perché non ogni
  -- tipo di notifica ha tutti e tre i riferimenti.
  cluster_id  uuid references public.clusters(id) on delete cascade,
  action_id   uuid references public.actions(id)  on delete cascade,
  report_id   uuid references public.reports(id)  on delete cascade,

  -- L'unicità è il meccanismo, non un vincolo di igiene. La chiave la compone
  -- chi emette (es. 'gruppo_pubblico:<cluster_id>:<citizen_id>'): due
  -- esecuzioni dello stesso job producono la stessa chiave e la seconda
  -- insert fallisce con 23505, che il chiamante interpreta come «già fatto».
  dedupe_key  text not null unique,

  -- Il testo pronto per il canale (o i dati per comporlo). MAI raw_text: una
  -- notifica non è il posto dove far uscire il racconto grezzo di qualcuno.
  payload     jsonb not null default '{}'::jsonb,

  sent_at     timestamptz,
  failed_at   timestamptz,
  last_error  text,
  attempts    int not null default 0,
  created_at  timestamptz not null default now()
);

-- «Cosa ho già mandato a questa persona»: serve al job e alla pagina personale.
create index if not exists notifications_citizen_created_idx
  on public.notifications (citizen_id, created_at desc);

-- La coda da spedire. Parziale di proposito: le notifiche in attesa sono poche
-- e le già spedite sono tante e crescono per sempre. Un indice pieno
-- costringerebbe il job a scartare l'intero storico a ogni giro.
create index if not exists notifications_da_inviare_idx
  on public.notifications (created_at)
  where sent_at is null and failed_at is null;

alter table public.notifications enable row level security;

-- anon non ha nulla da fare qui: chi non ha sessione non è nessuno, e le
-- notifiche dicono chi ha segnalato cosa.
revoke all on table public.notifications from anon;

drop policy if exists notification_owner_read on public.notifications;
create policy notification_owner_read on public.notifications
  for select to authenticated
  using (citizen_id = public.current_citizen_id());

-- Nessuna policy di insert/update/delete per i client: le notifiche le scrive
-- il job con service role. Un cittadino che potesse crearle potrebbe scrivere
-- a nome di VOCE nella casella di un altro.
-- La policy di lettura per l'amministratore sta nella §10, insieme alle altre.

comment on table public.notifications is
  'Registro degli avvisi mandati ai cittadini. Esiste perché il bot promette a '
  'tutti «ti scrivo appena diventa parte di un''azione collettiva» e finora '
  'nessun codice manteneva la promessa. Una riga qui è la prova che l''avviso '
  'è partito, ed è ciò che impedisce di mandarlo due volte.';

comment on column public.notifications.dedupe_key is
  'Chiave di idempotenza composta dal chiamante, es. '
  '«gruppo_pubblico:<cluster_id>:<citizen_id>». Il vincolo unique è il '
  'meccanismo che rende innocuo un job eseguito due volte: la seconda insert '
  'viola il vincolo e il chiamante la legge come «già fatto». Ricevere due '
  'volte lo stesso avviso è il modo più veloce di far disiscrivere qualcuno.';

comment on column public.notifications.payload is
  'Dati per comporre il messaggio. Non contiene mai reports.raw_text: il '
  'racconto grezzo non esce dalla sua tabella, nemmeno verso il suo autore.';

comment on column public.notifications.attempts is
  'Tentativi di consegna. Serve a distinguere «non ancora provato» da «provato '
  'e fallito cinque volte»: il secondo caso è un guasto da guardare, non una '
  'coda da riprocessare all''infinito.';

-- ---------------------------------------------------------------------------
-- Cosa NON può finire dentro una notifica
--
-- `payload` è jsonb libero, e il jsonb libero è il posto dove i dati personali
-- si depositano senza che nessuno se ne accorga: chi scriverà il job fra sei
-- mesi ci infilerà il numero di telefono del destinatario «perché serviva a
-- comporre il messaggio», e da lì il recapito di un cittadino vive in una
-- tabella di servizio che nessuno rilegge.
--
-- Il vincolo trasforma la disciplina in un errore di scrittura. Il testo si
-- compone da fatti già pubblici (titolo del gruppo, stato dell'atto); il
-- recapito lo risolve il job con service role al momento dell'invio, leggendo
-- `citizens`, e non resta scritto qui.
--
-- `jsonb_exists_any(...)` e non l'operatore `?|`: identico nel comportamento,
-- ma il punto interrogativo dentro una definizione di vincolo viene scambiato
-- per un segnaposto di parametro da diversi driver, e la migrazione fallirebbe
-- fuori da psql.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname  = 'notifications_payload_senza_identificatori'
       and conrelid = 'public.notifications'::regclass
  ) then
    alter table public.notifications
      add constraint notifications_payload_senza_identificatori check (
        not jsonb_exists_any(payload, array[
          'raw_text', 'clean_text', 'phone', 'phone_e164', 'email',
          'telegram_id', 'chat_id', 'whatsapp', 'display_name',
          'ip', 'ip_hash', 'public_token'
        ])
      );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- last_error non deve diventare una rubrica
--
-- Gli errori dei provider rimandano indietro il destinatario dentro il testo
-- («Bad Request: chat not found — chat_id 123456789», «The 'To' number
-- +39... is not a valid phone number»). Salvarli integri significa costruire,
-- una consegna fallita alla volta, l'elenco dei recapiti dei cittadini in una
-- colonna nata per la diagnostica.
--
-- La ripulitura sta in un trigger e non nel job: un secondo percorso di
-- scrittura (uno script di reimportazione, una correzione a mano) salterebbe
-- la regola applicativa e nessuno se ne accorgerebbe.
-- ---------------------------------------------------------------------------

create or replace function public.scrub_notification_error()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.last_error is not null then
    new.last_error := regexp_replace(
      new.last_error,
      '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}', '[indirizzo]', 'g');
    new.last_error := regexp_replace(
      new.last_error,
      '\+?[0-9][0-9 ().-]{6,}[0-9]', '[recapito]', 'g');
    -- Un codice di errore sta in due righe. Tutto il resto è testo del
    -- provider, cioè materiale che non abbiamo scritto noi e non controlliamo.
    new.last_error := left(new.last_error, 200);
  end if;
  return new;
end;
$$;

drop trigger if exists notifications_before_write on public.notifications;
create trigger notifications_before_write
  before insert or update on public.notifications
  for each row execute function public.scrub_notification_error();

revoke all on function public.scrub_notification_error() from public, anon, authenticated;

comment on function public.scrub_notification_error is
  'Toglie indirizzi e numeri dal messaggio di errore del provider e lo tronca a '
  '200 caratteri. Senza, `last_error` diventa l''elenco dei recapiti dei '
  'cittadini una consegna fallita alla volta.';


-- ============================================================================
-- 2. MODERAZIONE (PLAN2 §1.3) — lo stato che nessuno usava
--
-- Lo schema ha `report_status = 'quarantena'` e `reports.moderation_flagged`
-- dalla prima migrazione. Nessuna riga di codice li valorizza. Oggi un insulto,
-- una minaccia o un contenuto diffamatorio entra nel sistema come qualunque
-- altra segnalazione, si raggruppa, e può finire citato dentro un esposto
-- indirizzato a una Procura — con la firma di cittadini che non l'hanno mai
-- letto.
--
-- Qui non si aggiunge la moderazione (la fa `triageReport` con
-- omni-moderation-latest, lato applicazione): si aggiunge ciò che serve per
-- RIVEDERLA a mano. Un punteggio senza le categorie che l'hanno prodotto non è
-- revisionabile, e una decisione automatica che nessuno può contestare non è
-- moderazione: è censura senza appello.
--
-- La quarantena NON cancella: mette da parte. I falsi positivi su dialetto e
-- turpiloquio non offensivo sono attesi (PLAN2 §1.3), e chi scrive «'sta
-- schifezza di strada» deve poter essere rimesso in circolo da una persona.
-- ============================================================================

alter table public.reports
  add column if not exists moderation_categories   jsonb,
  add column if not exists moderation_score        numeric,
  add column if not exists moderated_at            timestamptz,
  add column if not exists moderation_reviewed_by  text,
  add column if not exists moderation_reviewed_at  timestamptz,
  -- Da dove veniva la segnalazione prima della quarantena. Senza questa
  -- colonna la quarantena è una porta a senso unico: il trigger qui sotto
  -- stacca `cluster_id` e nessun percorso sa più dove rimettere la riga, così
  -- il falso positivo su dialetto o turpiloquio viene «liberato» come stato ma
  -- resta fuori dal gruppo dei suoi vicini — e il gruppo perde un cittadino
  -- distinto, quindi può scendere sotto la soglia e sparire dalla pagina.
  add column if not exists previous_cluster_id     uuid
    references public.clusters(id) on delete set null;

comment on column public.reports.moderation_categories is
  'Categorie restituite dal classificatore (violenza, odio, autolesionismo…), '
  'come oggetto jsonb. Senza le categorie il punteggio non è contestabile: chi '
  'rivede deve sapere PERCHÉ il sistema ha messo da parte una persona.';

comment on column public.reports.moderation_score is
  'Punteggio massimo fra le categorie. È un giudizio sul TESTO, mai sulla '
  'persona: non si accumula, non si media per cittadino, non entra in nessuna '
  'decisione che riguardi chi ha scritto (PLAN2 §7).';

comment on column public.reports.moderation_reviewed_by is
  'Chi ha rivisto la quarantena, con nome e cognome. Una segnalazione tolta '
  'dalla quarantena senza traccia di chi l''ha fatto è una decisione senza '
  'responsabile.';

comment on column public.reports.previous_cluster_id is
  'Il gruppo da cui la moderazione ha staccato questa segnalazione. Serve a '
  'rimetterla dov''era dopo una revisione che la assolve: la quarantena mette '
  'da parte, non espelle. Il riaggancio lo fa il ri-raggruppamento lato '
  'applicazione, che ripesca le righe «triaged, senza gruppo, già riviste».';

-- ---------------------------------------------------------------------------
-- Verifica dei percorsi pubblici: nessuno può mostrare una riga in quarantena
--
-- Superficie per superficie, alla data di questa migrazione:
--
--   public_cluster_reports  → filtra `r.status = 'clustered'`: 'quarantena' è
--                             un valore diverso, quindi è già esclusa. La §13
--                             la ricrea aggiungendo `moderation_flagged =
--                             false`, perché lo stato da solo non copre la riga
--                             segnalata dal classificatore e non ancora decisa.
--   public_clusters         → legge solo `clusters`, nessun testo di report.
--   public_actions          → legge `actions`; il corpo dell'atto arriva dal
--                             dossier, che cita solo `anon_text` di report
--                             appartenenti a un gruppo.
--   public_city_stats       → aggregati sui gruppi.
--   public_platform_stats   → conta le righe di `reports` senza filtrare lo
--                             stato. Espone SOLO un numero, nessun contenuto e
--                             nessuna identità: non è un percorso di fuga, ma
--                             è annotato perché un domani non venga scambiato
--                             per una garanzia.
--   get_report_status(token)→ mostra lo stato al solo detentore del link, cioè
--                             all'autore. Che sappia di essere in revisione è
--                             corretto: è il contrario di una censura muta.
--   match_similar_reports   → esclude già `r.status <> 'quarantena'` (0002).
--   search_public_clusters  → §11 di questa migrazione: filtra `status =
--                             'clustered'`, quindi esclusa a monte.
--
-- IL PERCORSO CHE RESTAVA APERTO, e che qui si chiude.
-- Una segnalazione può essere messa in quarantena DOPO essere già stata
-- raggruppata: basta una moderazione ritardata, un ri-triage, o una revisione
-- umana che riclassifica un testo. In quel caso `cluster_id` resterebbe
-- valorizzato, la riga continuerebbe a gonfiare `citizens_count` e — soprattutto
-- — `generateDossier()` la pescherebbe fra le citazioni, perché seleziona per
-- `cluster_id` e `anon_text is not null` senza guardare lo stato.
--
-- La regola va nel database e non nell'applicazione: una regola applicativa si
-- aggira per distrazione, un trigger no. Chi va in quarantena esce dal gruppo,
-- sempre, da qualunque percorso arrivi l'aggiornamento.
--
-- DUE COLONNE, NON UNA. Lo stato 'quarantena' e il flag `moderation_flagged`
-- descrivono la stessa condizione da due lati: il primo è la decisione, il
-- secondo è il sospetto del classificatore. `report_is_under_moderation()`
-- (§10) li tratta già come equivalenti, e devono esserlo anche qui: una riga
-- con `moderation_flagged = true` e `status = 'clustered'` resterebbe altrimenti
-- dentro il gruppo, continuerebbe a gonfiare `citizens_count`, il suo
-- `anon_text` uscirebbe da public_cluster_reports e generateDossier() la
-- citerebbe dentro un esposto. È esattamente il percorso che questa sezione
-- dichiara di chiudere, con l'altra colonna.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_quarantine_unclustered()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (new.status = 'quarantena' or new.moderation_flagged = true)
     and new.cluster_id is not null then
    -- Prima di staccare, si ricorda da dove: una revisione che assolve deve
    -- poter rimettere la persona con i suoi vicini.
    new.previous_cluster_id := new.cluster_id;
    new.cluster_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists reports_before_quarantine on public.reports;
create trigger reports_before_quarantine
  before insert or update on public.reports
  for each row execute function public.enforce_quarantine_unclustered();

-- Il trigger `reports_after_change` di 0002 è dichiarato `after update of
-- cluster_id, citizen_id`: la clausola OF guarda le colonne nella SET list
-- dello statement, non i valori cambiati da un trigger BEFORE. Un
-- `update reports set status='quarantena'` quindi NON lo sveglierebbe, e il
-- gruppo resterebbe con i contatori gonfiati da una riga che non gli
-- appartiene più. Questo secondo trigger copre esattamente quel caso.
create or replace function public.after_quarantine_refresh()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.cluster_id is not null then
    perform public.refresh_cluster_counters(old.cluster_id);
  end if;
  return null;
end;
$$;

drop trigger if exists reports_after_quarantine on public.reports;
create trigger reports_after_quarantine
  after update of status, moderation_flagged on public.reports
  for each row
  when (
    (new.status = 'quarantena' or new.moderation_flagged = true)
    and old.cluster_id is distinct from new.cluster_id
  )
  execute function public.after_quarantine_refresh();

-- Anche le funzioni di trigger nascono con EXECUTE a PUBLIC. Un trigger
-- continua a scattare anche dopo la revoca — il privilegio si verifica alla
-- CREATE TRIGGER, non a ogni riga (verificato sul database locale) — quindi
-- non c'è alcuna ragione di lasciarle raggiungibili. Nessun grant: non devono
-- essere chiamate da nessuno.
revoke all on function public.enforce_quarantine_unclustered() from public, anon, authenticated;
revoke all on function public.after_quarantine_refresh()       from public, anon, authenticated;

comment on function public.enforce_quarantine_unclustered is
  'Chi finisce in quarantena esce dal gruppo, sempre. Chiude il percorso per '
  'cui una segnalazione moderata DOPO il raggruppamento resterebbe citabile '
  'dentro un atto: generateDossier() seleziona per cluster_id e anon_text, non '
  'per stato. Sta nel database perché una regola applicativa si dimentica.';

comment on function public.after_quarantine_refresh is
  'Ricalcola i contatori del gruppo da cui una segnalazione è stata staccata '
  'per quarantena. Il trigger di 0002 non basta: la sua clausola `update of '
  'cluster_id` non scatta se lo statement tocca solo `status`.';


-- ============================================================================
-- 3. MULTILINGUA (PLAN2 §2.2)
--
-- Corvetto, Sanità e Ballarò sono i posti d'Italia dove si parlano più lingue.
-- Accettare solo l'italiano non è una limitazione tecnica neutra: esclude
-- sistematicamente proprio chi ha meno strumenti per farsi sentire per altre
-- vie, cioè le persone per cui VOCE esiste.
--
-- Il limite da tenere fermo, e il motivo per cui queste sono DUE colonne e non
-- una: `clean_text` e `anon_text` restano SEMPRE in italiano. Il raggruppamento
-- lavora su una lingua sola — embedding di lingue diverse sullo stesso problema
-- non si avvicinano abbastanza, e due gruppi paralleli sulla stessa buca sono
-- due gruppi che non raggiungono mai la soglia. Gli atti restano in italiano
-- perché si scrivono a una Procura o a un Responsabile della trasparenza.
--
-- La lingua serve a due cose sole: rispondere al cittadino nella sua, che è la
-- differenza fra essere tollerati ed essere accolti; e sapere chi stiamo
-- davvero raggiungendo, che è l'unico modo di accorgersi di chi manca.
-- ============================================================================

alter table public.reports
  add column if not exists original_language text;

alter table public.citizens
  add column if not exists preferred_language text;

comment on column public.reports.original_language is
  'Lingua in cui il cittadino ha scritto, ISO 639-1 (''it'' quando è italiano). '
  'NON cambia clean_text né anon_text, che restano sempre in italiano: il '
  'raggruppamento lavora su una lingua sola e gli atti si scrivono a una '
  'Procura. Serve a sapere chi stiamo raggiungendo — e chi no.';

comment on column public.citizens.preferred_language is
  'Lingua in cui il bot risponde a questa persona, ISO 639-1. Ereditata dalla '
  'prima segnalazione e modificabile. Rispondere nella lingua di chi scrive è '
  'la differenza fra essere tollerati ed essere accolti.';


-- ============================================================================
-- 4. MEDIA: VOCALI E FOTO (PLAN2 §2.1, §2.3)
--
-- Oggi il bot risponde «per ora leggo solo messaggi scritti» e la segnalazione
-- è persa. Ma il vocale è IL MODO IN CUI PARLANO le persone che VOCE esiste per
-- raggiungere: over 65, chi ha poca dimestichezza con la tastiera, chi non
-- scrive bene in italiano, chi ha le mani occupate. Un anziano che ha aspettato
-- otto ore al pronto soccorso non scrive tre paragrafi: manda trenta secondi di
-- voce. Una foto di una buca o di una perdita d'acqua, allo stesso modo, dice
-- più di tre paragrafi ed è una prova.
--
-- E sono anche i due dati più pericolosi che questo progetto abbia mai
-- conservato. Una registrazione vocale è un dato biometrico ai sensi dell'art.
-- 9 GDPR: identifica una persona anche senza nome, anche fra dieci anni. Una
-- foto scattata in strada contiene volti di passanti che non hanno scritto a
-- VOCE, targhe, numeri civici, vetrine di negozi.
--
-- Da qui le tre regole scritte nel vincolo, non nella buona volontà:
--   1. il file sta in un bucket PRIVATO, mai in uno pubblico;
--   2. questa tabella NON ha e non avrà MAI una vista pubblica;
--   3. nessuna policy per anon o authenticated. Solo service role, più la
--      policy dell'amministratore della §10, ristretta ai soli media collegati
--      a una segnalazione in moderazione.
--
-- Ciò che entra nel flusso civico è `transcript` (vocali) o `description`
-- (foto), e da lì il percorso è identico a quello testuale: triage,
-- anonimizzazione, embedding. L'originale non esce mai.
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
     where t.typname = 'media_kind' and n.nspname = 'public'
  ) then
    create type public.media_kind as enum ('audio', 'foto');
  end if;
end
$$;

create table if not exists public.report_media (
  id               uuid primary key default gen_random_uuid(),
  report_id        uuid not null references public.reports(id) on delete cascade,
  kind             public.media_kind not null,

  -- Percorso nel bucket PRIVATO 'segnalazioni-media'. Non è un URL: un URL
  -- salvato in colonna prima o poi finisce in una pagina. Le pagine ricevono
  -- al massimo una signed URL a tempo, generata sul server al momento.
  storage_path     text not null,

  mime_type        text,
  bytes            int,
  duration_seconds int,

  -- Audio: la trascrizione, forzata in italiano. È l'unico contenuto del
  -- vocale che prosegue nel flusso.
  transcript       text,

  -- Foto: la descrizione prodotta dal modello con visione. Descrive il
  -- problema e il degrado, non le persone.
  description      text,

  is_synthetic     boolean not null default false,
  created_at       timestamptz not null default now(),

  -- Idempotenza dei canali: Telegram rinvia lo stesso update, e reinserire lo
  -- stesso file creerebbe una seconda trascrizione e un secondo embedding,
  -- cioè un cittadino che conta doppio dentro un gruppo.
  unique (report_id, storage_path)
);

create index if not exists report_media_report_idx
  on public.report_media (report_id);

create index if not exists report_media_kind_created_idx
  on public.report_media (kind, created_at desc);

alter table public.report_media enable row level security;

-- Difesa in profondità: la RLS basterebbe, ma togliere anche il privilegio di
-- tabella a `anon` rende impossibile persino il tentativo via PostgREST.
revoke all on table public.report_media from anon;

-- NESSUNA policy per anon o authenticated, intenzionalmente. L'unica policy su
-- questa tabella è quella dell'amministratore, nella §10, e vale solo per i
-- media collegati a una segnalazione in quarantena o segnalata.

comment on table public.report_media is
  'Vocali e foto allegati a una segnalazione. NON ESISTE E NON DEVE MAI '
  'ESISTERE UNA VISTA PUBBLICA SU QUESTA TABELLA. Un messaggio vocale è un '
  'dato biometrico ai sensi dell''art. 9 GDPR: identifica chi parla anche '
  'senza nome. Una foto scattata in strada contiene volti di passanti che non '
  'hanno mai scritto a VOCE, targhe e numeri civici. Ciò che prosegue nel '
  'flusso civico è la trascrizione o la descrizione, mai il file.';

comment on column public.report_media.storage_path is
  'Percorso dentro il bucket privato «segnalazioni-media». Non è un URL di '
  'proposito: un URL in colonna prima o poi finisce dentro una pagina. '
  'L''accesso passa da una signed URL a tempo generata dal server.';

comment on column public.report_media.transcript is
  'Trascrizione del vocale, forzata in italiano. È l''unico contenuto '
  'dell''audio che entra nel triage: l''originale resta fermo nel bucket.';

comment on column public.report_media.description is
  'Descrizione della foto prodotta da un modello con visione: il problema e il '
  'degrado visibili, più eventuali targhe di via utili a localizzare. Mai le '
  'persone inquadrate. In pagina pubblica si mostra questa, mai l''originale.';

-- ---------------------------------------------------------------------------
-- Bucket di storage privato
--
-- `public = false` è la riga più importante del blocco: in un bucket pubblico
-- ogni file è scaricabile da chiunque conosca o indovini il percorso, senza
-- token e senza RLS. Un vocale in un bucket pubblico è una persona
-- identificabile lasciata su internet.
--
-- Nessuna policy su storage.objects, né per anon né per authenticated: si
-- accede solo con service role, e le pagine ricevono al massimo una signed URL
-- a tempo. Una policy «authenticated può leggere» su questo bucket
-- significherebbe che qualunque utente registrato scarica i vocali di tutti.
--
-- La guardia su to_regclass serve per gli ambienti dove lo schema `storage`
-- non è installato (un Postgres nudo, un lint offline): la migrazione non deve
-- fallire lì, perché il resto dello schema non dipende dal bucket.
--
-- DUE CORREZIONI RISPETTO ALLA FORMA OVVIA DI QUESTO BLOCCO.
--
-- 1. `on conflict do nothing` NON garantisce niente. Se il bucket esisteva già
--    — creato a mano dal pannello durante una prova, da uno script di seed, in
--    un ambiente riusato — ed era PUBBLICO, la migrazione passerebbe senza
--    errore e senza cambiarlo. Dichiarerebbe una garanzia che non fornisce, e
--    il fallimento sarebbe silenzioso: nessuno se ne accorge finché un vocale
--    non è su internet. Da qui `do update set public = false`, e subito dopo un
--    controllo che interrompe la migrazione invece di proseguire.
--
-- 2. La colonna `public` non esiste su tutte le immagini: su un Postgres
--    Supabase appena avviato, prima che le migrazioni di storage-api abbiano
--    girato, `storage.buckets` ha solo id/name/owner/date. Creare lì un bucket
--    che non possiamo marcare come privato è peggio che non crearlo: si salta,
--    con un avviso. Sul progetto reale la colonna c'è e il ramo non si usa.
-- ---------------------------------------------------------------------------

do $$
declare
  ancora_pubblico boolean;
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'schema storage assente: bucket segnalazioni-media non creato';
    return;
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'storage' and table_name = 'buckets'
       and column_name = 'public'
  ) then
    raise notice
      'storage.buckets senza colonna «public»: bucket segnalazioni-media NON '
      'creato. Un bucket che non possiamo marcare privato non va creato.';
    return;
  end if;

  insert into storage.buckets (id, name, public)
  values ('segnalazioni-media', 'segnalazioni-media', false)
  on conflict (id) do update set public = false;

  select b.public into ancora_pubblico
    from storage.buckets b
   where b.id = 'segnalazioni-media';

  if coalesce(ancora_pubblico, true) then
    raise exception
      'bucket segnalazioni-media risulta pubblico: migrazione interrotta. '
      'Un vocale in un bucket pubblico è una persona identificabile lasciata '
      'su internet.';
  end if;

  -- Limite di dimensione e tipi ammessi, se questa versione di Storage li
  -- supporta. Non sono estetica: un endpoint di upload senza limite è un
  -- endpoint di riempimento del disco, e un bucket che accetta qualunque MIME
  -- accetta anche un eseguibile con estensione .jpg.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'storage' and table_name = 'buckets'
       and column_name = 'file_size_limit'
  ) then
    update storage.buckets
       set file_size_limit = 26214400   -- 25 MB: un vocale lungo o una foto
     where id = 'segnalazioni-media'
       and file_size_limit is distinct from 26214400;
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'storage' and table_name = 'buckets'
       and column_name = 'allowed_mime_types'
  ) then
    update storage.buckets
       set allowed_mime_types = array[
             'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac',
             'audio/wav', 'audio/webm', 'audio/x-m4a',
             'image/jpeg', 'image/png', 'image/webp', 'image/heic'
           ]
     where id = 'segnalazioni-media';
  end if;
end
$$;


-- ============================================================================
-- 5. SCADENZARIO NORMATIVO (PLAN2 §3.1) — il più sottovalutato
--
-- Ogni atto ha un termine di legge, e il silenzio della PA ha conseguenze
-- precise: non è un'attesa indefinita, è un inadempimento con un rimedio.
-- Finora nessuno contava quei giorni. Un accesso civico ignorato restava
-- ignorato per sempre, e il cittadino che aveva firmato imparava che scrivere
-- non serve — che è esattamente la convinzione che VOCE esiste per smontare.
--
-- `deadline_basis` non è documentazione: è la condizione perché il termine sia
-- verificabile. Si scrive in chiaro la norma da cui viene, per esteso — «art. 5
-- c. 6 D.Lgs. 33/2013 — 30 giorni» — perché un termine senza fonte è
-- un'affermazione, e un'affermazione sbagliata dentro un sollecito fa
-- cestinare tutto il fascicolo.
--
-- `follow_up_of_action_id` tiene la catena: sollecito → riesame → difensore
-- civico. Senza il legame, il secondo atto è un documento orfano che nessuno
-- sa collegare al primo, e la storia del gruppo si spezza a metà.
-- ============================================================================

alter table public.actions
  add column if not exists deadline_at             timestamptz,
  add column if not exists deadline_days           int,
  add column if not exists deadline_basis          text,
  add column if not exists follow_up_of_action_id  uuid references public.actions(id) on delete set null,
  add column if not exists follow_up_generated_at  timestamptz;

-- La query del job giornaliero, e nient'altro. Parziale su due condizioni
-- perché gli atti con un termine attivo sono una frazione minima del totale:
-- le bozze non hanno scadenza (non sono partite) e gli archiviati non
-- interessano più. Un indice pieno farebbe scandire ogni giorno tutto lo
-- storico per trovare le tre righe che scadono domani.
create index if not exists actions_deadline_idx
  on public.actions (deadline_at)
  where deadline_at is not null
    and status in ('inviata', 'risposta_ricevuta');

create index if not exists actions_follow_up_idx
  on public.actions (follow_up_of_action_id)
  where follow_up_of_action_id is not null;

comment on column public.actions.deadline_at is
  'Momento in cui scade il termine di legge per la risposta, calcolato da '
  'submitted_at e dal tipo di atto. Null finché l''atto non è partito: un '
  'termine su una bozza non significa niente.';

comment on column public.actions.deadline_basis is
  'La norma da cui viene il termine, in chiaro e per esteso: «art. 5 c. 6 '
  'D.Lgs. 33/2013 — 30 giorni». Un termine senza fonte non è verificabile, e '
  'citare un termine sbagliato dentro un sollecito fa cestinare l''intero '
  'fascicolo e passare per inaffidabili i firmatari.';

comment on column public.actions.follow_up_of_action_id is
  'L''atto di cui questo è il seguito (sollecito, riesame, segnalazione al '
  'difensore civico). Tiene insieme la catena: senza, il secondo atto è un '
  'documento orfano e la storia del gruppo si spezza.';

comment on column public.actions.follow_up_generated_at is
  'Quando è stato generato l''atto di seguito PARTENDO da questo. Impedisce '
  'che il job giornaliero prepari lo stesso sollecito ogni mattina.';

-- ---------------------------------------------------------------------------
-- Quale atto viene dopo
--
-- È l'unica funzione di questa migrazione che USA i valori di enum aggiunti
-- dalla 0009, ed è il motivo per cui quella migrazione esiste separata.
--
-- La distinzione non è formale. L'accesso civico generalizzato ha un rimedio
-- suo, tipizzato dall'art. 5 c. 7 del D.Lgs. 33/2013: la richiesta di riesame
-- al titolare del potere sostitutivo, che è una persona diversa da chi ha
-- ignorato la richiesta e ha un termine proprio. Mandargli un «sollecito»
-- generico significa scrivere l'atto sbagliato alla persona sbagliata.
--
-- Per tutto il resto il seguito è il sollecito fondato sull'art. 2 della
-- L. 241/1990: il procedimento ha un termine e il silenzio non lo sospende.
--
-- LA CATENA DEVE TERMINARE, E DEVE ARRIVARE FINO IN FONDO.
-- La prima stesura di questa funzione mappava solo il primo passo e faceva
-- cadere nel ramo `else null` gli atti di seguito stessi: dopo un riesame
-- ignorato il job non preparava più niente, e il difensore civico — che PLAN2
-- §3.1 elenca come terzo rimedio — non era il seguito di nulla. La catena
-- promessa nel commento di sezione era smentita dal codice sotto.
--
--   accesso_civico          → riesame_accesso_civico   (art. 5 c. 7 D.Lgs. 33/2013)
--   riesame_accesso_civico  → segnalazione_difensore_civico
--   diffida_pa              → sollecito                (art. 2 L. 241/1990)
--   mozione_consigliere     → sollecito
--   sollecito               → segnalazione_difensore_civico
--
-- E si ferma lì: il difensore civico è l'ultima istanza non giurisdizionale di
-- questo percorso, sollecitare lui non è un rimedio previsto. La versione
-- precedente lo rimandava a 'sollecito', cioè a un anello che riportava al
-- punto di partenza: una catena che gira su sé stessa prepara atti all'infinito
-- a nome di cittadini che ne hanno già firmati tre.
--
-- Un esposto in Procura NON ha un atto di seguito automatico: sollecitare un
-- pubblico ministero non è un rimedio previsto, è rumore. Ritorna null, e il
-- job non prepara niente.
-- ---------------------------------------------------------------------------

create or replace function public.action_follow_up_kind(kind public.action_kind)
returns public.action_kind
language sql
immutable
set search_path = public, pg_temp
as $$
  select case kind
    when 'accesso_civico'         then 'riesame_accesso_civico'::public.action_kind
    when 'riesame_accesso_civico' then 'segnalazione_difensore_civico'::public.action_kind
    when 'diffida_pa'             then 'sollecito'::public.action_kind
    when 'mozione_consigliere'    then 'sollecito'::public.action_kind
    when 'sollecito'              then 'segnalazione_difensore_civico'::public.action_kind
    -- esposto_procura, dossier_giornalistico e segnalazione_difensore_civico:
    -- nessun seguito automatico. Un sollecito a una Procura non è un rimedio, e
    -- oltre il difensore civico questo percorso non arriva.
    else null::public.action_kind
  end;
$$;

revoke all on function public.action_follow_up_kind(public.action_kind)
  from public, anon, authenticated;
grant execute on function public.action_follow_up_kind(public.action_kind)
  to service_role;

comment on function public.action_follow_up_kind is
  'Quale atto preparare quando scade il termine senza risposta. L''accesso '
  'civico ha un rimedio tipizzato (riesame al titolare del potere sostitutivo, '
  'art. 5 c. 7 D.Lgs. 33/2013) con un destinatario diverso; gli altri hanno il '
  'sollecito dell''art. 2 L. 241/1990. Il secondo passo, per entrambi i rami, '
  'è la segnalazione al difensore civico, e lì la catena si ferma: oltre non '
  'c''è rimedio non giurisdizionale, e un anello che torna indietro '
  'preparerebbe atti all''infinito. L''esposto in Procura non ha seguito. '
  'Ritornare null significa «non preparare niente», mai «prepara qualcosa di '
  'generico».';


-- ============================================================================
-- 6. RISPOSTE DELLA PA (PLAN2 §3.2)
--
-- Quando una risposta arriva è un PDF in burocratese. Un modello può
-- classificarla, estrarne il motivo del rifiuto, riconoscere se cita
-- un'esclusione dell'art. 5-bis e proporre il rimedio. Serve al cittadino, e
-- serve a /trasparenza: la domanda «quali comuni rispondono davvero» oggi non
-- ha dati perché nessuno legge le risposte.
--
-- IL RISCHIO, che decide l'intera forma di questa tabella.
-- Una classificazione sbagliata fa dichiarare pubblicamente che un comune ha
-- ignorato una richiesta a cui invece aveva risposto. È un'accusa falsa a
-- un'istituzione, pubblicata a nome di cittadini che non l'hanno controllata,
-- ed è il tipo di errore che distrugge la credibilità di VOCE in un pomeriggio
-- — e con essa quella di ogni gruppo che l'ha usata.
--
-- Da qui: la classificazione DEVE essere confermata da una persona prima di
-- comparire in pagina. `confirmed_by` non è un campo di comodo, è la
-- condizione di pubblicabilità, imposta dal vincolo qui sotto e dalla vista
-- public_action_responses.
--
-- `raw_text` è il testo integrale della risposta ed è PRIVATO: può contenere
-- nomi di funzionari, riferimenti di protocollo, dati di terzi e persino dati
-- del richiedente. Non compare in nessuna vista pubblica, e non va copiato
-- dentro actions.response_text (che invece è pubblico via public_actions).
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
     where t.typname = 'pa_response_class' and n.nspname = 'public'
  ) then
    create type public.pa_response_class as enum (
      'accolta',        -- la richiesta è stata soddisfatta
      'respinta',       -- rifiuto motivato nel merito
      'interlocutoria', -- risposta che non decide: rinvia, chiede, sospende
      'irricevibile'    -- rifiuto in rito: incompetenza, forma, termini
    );
  end if;
end
$$;

create table if not exists public.action_responses (
  id                uuid primary key default gen_random_uuid(),
  action_id         uuid not null references public.actions(id) on delete cascade,
  received_at       timestamptz not null default now(),

  -- Come ci è arrivata: 'manuale' (qualcuno l'ha caricata), 'pec', 'email'.
  source            text not null default 'manuale',

  -- PRIVATO. Non esce mai: né in una vista, né in una API aperta, né dentro
  -- actions.response_text, che è pubblico.
  raw_text          text not null,
  document_url      text,

  -- Prodotti dal modello, validi solo dopo conferma umana. PRIVATI: `reason` e
  -- `proposed_remedy` sono un estratto di `raw_text` riscritto da un modello, e
  -- niente impedisce che si portino dietro un nome di funzionario, un numero di
  -- protocollo o un dato del richiedente. Non escono da questa tabella.
  classification    public.pa_response_class,
  reason            text,
  cites_art_5bis    boolean not null default false,
  proposed_remedy   text,
  classified_at     timestamptz,

  -- Le versioni pubblicabili, prodotte dallo stesso passaggio di
  -- anonimizzazione che genera `reports.anon_text`. Sono due colonne separate
  -- per lo stesso motivo per cui su `reports` ci sono raw_text/clean_text/
  -- anon_text: tenere il testo grezzo e il testo pubblicabile nella stessa
  -- colonna significa che prima o poi si pubblica quello sbagliato.
  reason_anon           text,
  proposed_remedy_anon  text,
  anonymized_at         timestamptz,

  -- La firma della persona che si è presa la responsabilità della lettura.
  confirmed_by      text,
  confirmed_at      timestamptz,

  created_at        timestamptz not null default now(),

  -- Non si conferma il vuoto. Confermare una risposta senza averla classificata
  -- la renderebbe pubblica come «classificazione assente», che in pagina si
  -- legge come «non risulta risposta»: l'accusa falsa che vogliamo evitare.
  constraint action_responses_confirm_requires_class check (
    confirmed_by is null or classification is not null
  ),

  -- Chi conferma lascia sempre la data. Il trigger la mette da solo, il
  -- vincolo garantisce che non si possa aggirare con un update diretto.
  constraint action_responses_confirmed_at_present check (
    (confirmed_by is null) = (confirmed_at is null)
  )
);

-- Le colonne anonimizzate anche per una tabella già creata da un'esecuzione
-- precedente di questa migrazione: `create table if not exists` non le
-- aggiungerebbe, e la vista pubblica qui sotto le richiede.
alter table public.action_responses
  add column if not exists reason_anon          text,
  add column if not exists proposed_remedy_anon text,
  add column if not exists anonymized_at        timestamptz;

create index if not exists action_responses_action_idx
  on public.action_responses (action_id, received_at desc);

-- Le risposte da confermare: la coda di lavoro dell'amministratore.
create index if not exists action_responses_da_confermare_idx
  on public.action_responses (received_at)
  where confirmed_by is null;

alter table public.action_responses enable row level security;
revoke all on table public.action_responses from anon;

-- Nessuna policy per anon né per il cittadino: la lettura pubblica passa
-- SOLO dalla vista public_action_responses, che espone le sole colonne
-- confermate. La policy dell'amministratore sta nella §10.

comment on table public.action_responses is
  'Risposte della pubblica amministrazione a un atto. `raw_text` è privato e '
  'non esce da qui. Una classificazione non confermata da una persona non è '
  'pubblica: dichiarare che un comune ha ignorato una richiesta a cui invece '
  'aveva risposto è un''accusa falsa firmata dai cittadini.';

comment on column public.action_responses.raw_text is
  'Testo integrale della risposta. PRIVATO: contiene protocolli, nomi di '
  'funzionari e talvolta dati del richiedente. Non va copiato in '
  'actions.response_text, che è esposto da public_actions.';

comment on column public.action_responses.cites_art_5bis is
  'La risposta invoca un''esclusione dell''art. 5-bis D.Lgs. 33/2013. È il '
  'motivo di rifiuto più frequente e più contestabile: sapere quante volte '
  'viene invocato, e per cosa, è metà del lavoro di /trasparenza.';

comment on column public.action_responses.confirmed_by is
  'Nome e cognome di chi ha letto la risposta e confermato la '
  'classificazione. Finché è null, niente di questa riga è pubblico. '
  'ATTENZIONE: è una conferma sull''ESITO («è davvero un diniego?»), non una '
  'revisione di anonimizzazione. Per il testo la garanzia è un''altra colonna, '
  'vedi reason_anon.';

comment on column public.action_responses.reason is
  'Motivo del rifiuto come estratto dal modello. PRIVATO al pari di raw_text, '
  'di cui è una riscrittura: può contenere il nome del funzionario che ha '
  'firmato, il numero di protocollo, talvolta dati del richiedente. La conferma '
  'umana riguarda la classificazione, non la pubblicabilità di questo testo.';

comment on column public.action_responses.reason_anon is
  'La versione pubblicabile del motivo, prodotta dallo stesso passaggio di '
  'anonimizzazione di reports.anon_text. È QUESTA che finisce in '
  'public_action_responses. Finché è null, la vista mostra la classificazione '
  'e nessun testo: meglio una riga senza motivo che il nome di una persona in '
  'una pagina indicizzabile.';

-- ---------------------------------------------------------------------------
-- Conferma: data automatica e ricaduta sull'atto
--
-- Sta in un trigger e non nell'applicazione perché deve valere SEMPRE: una
-- risposta confermata da uno script di importazione, da un job o dal pannello
-- deve aggiornare l'atto allo stesso modo. Se questa logica vive in un route
-- handler, il primo percorso alternativo la salta e l'atto resta «in attesa»
-- per sempre in una pagina pubblica.
--
-- Sul cambio di stato: si passa a 'risposta_ricevuta' SOLO da 'inviata'.
-- 'inviata' implica già, per il vincolo actions_review_before_send, che
-- reviewed_by e reviewed_at siano valorizzati — quindi la transizione non può
-- violare il vincolo e non lo indebolisce di un millimetro.
-- ---------------------------------------------------------------------------

create or replace function public.before_action_response_confirm()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.confirmed_by is not null and new.confirmed_at is null then
    new.confirmed_at := now();
  end if;
  if new.confirmed_by is null then
    new.confirmed_at := null;
  end if;
  if new.classification is not null and new.classified_at is null then
    new.classified_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists action_responses_before_confirm on public.action_responses;
create trigger action_responses_before_confirm
  before insert or update on public.action_responses
  for each row execute function public.before_action_response_confirm();

create or replace function public.after_action_response_confirm()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.confirmed_by is null then
    return null;
  end if;

  update public.actions a
     set response_received_at = least(
           coalesce(a.response_received_at, new.received_at),
           new.received_at
         ),
         -- Solo da 'inviata': ogni altro stato o è già oltre, o non dovrebbe
         -- avere risposte. E 'inviata' garantisce già la revisione umana.
         status = case
                    when a.status = 'inviata' then 'risposta_ricevuta'::public.action_status
                    else a.status
                  end
   where a.id = new.action_id;

  return null;
end;
$$;

drop trigger if exists action_responses_after_confirm on public.action_responses;
create trigger action_responses_after_confirm
  after insert or update of confirmed_by, received_at on public.action_responses
  for each row execute function public.after_action_response_confirm();

revoke all on function public.before_action_response_confirm() from public, anon, authenticated;
revoke all on function public.after_action_response_confirm()  from public, anon, authenticated;

comment on function public.after_action_response_confirm is
  'Alla conferma di una risposta valorizza actions.response_received_at e, se '
  'l''atto era ''inviata'', lo porta a ''risposta_ricevuta''. È un trigger e '
  'non codice applicativo perché deve valere per ogni percorso di scrittura: '
  'un atto che resta «in attesa» su una pagina pubblica dopo che la risposta è '
  'arrivata è un''informazione falsa su un''amministrazione.';

-- ---------------------------------------------------------------------------
-- Vista pubblica delle risposte: solo il confermato, mai il testo grezzo
--
-- DUE CORREZIONI CHE VALGONO PIÙ DELLA VISTA STESSA.
--
-- 1. Si pubblicano `reason_anon` e `proposed_remedy_anon`, non `reason` e
--    `proposed_remedy`. Quei due sono un estratto di `raw_text` riscritto da un
--    modello: fra il testo privato e la pagina pubblica non c'era alcun
--    passaggio di anonimizzazione, solo `confirmed_by` — che però è una
--    conferma sull'esito, non sulla pubblicabilità del testo. Chi conferma sta
--    rispondendo a «è davvero un diniego?», non a «questo si può mettere
--    online?». Con le due colonne separate, finché l'anonimizzazione non è
--    passata la vista mostra la classificazione e nessun testo: /trasparenza
--    continua a funzionare, il nome del funzionario no.
--
-- 2. Si applica la soglia `min_public_citizens`, come in ogni altra superficie
--    pubblica. Senza, l'esito di un atto su un gruppo da due persone in una via
--    corta è pubblico con destinatario e motivo: la soglia esiste perché in un
--    gruppo piccolo nominare il problema equivale a nominare chi l'ha sollevato.
-- ---------------------------------------------------------------------------

drop view if exists public.public_action_responses;

create view public.public_action_responses as
  select r.id,
         r.action_id,
         r.classification,
         r.reason_anon           as reason,
         r.cites_art_5bis,
         r.proposed_remedy_anon  as proposed_remedy,
         -- Date troncate al giorno, come ovunque: l'orario al secondo permette
         -- correlazioni che il dato non deve consentire.
         date_trunc('day', r.received_at)  as received_at,
         date_trunc('day', r.confirmed_at) as confirmed_at
    from public.action_responses r
    join public.actions  a on a.id = r.action_id
    join public.clusters c on c.id = a.cluster_id
   where r.confirmed_by is not null
     and r.classification is not null
     and a.is_synthetic = false
     and c.is_synthetic = false
     and c.citizens_count >= public.config_int('min_public_citizens');

grant select on public.public_action_responses to anon, authenticated;

comment on view public.public_action_responses is
  'Risposte della PA visibili al pubblico. Espone SOLO righe con confirmed_by '
  'valorizzato, solo sopra la soglia min_public_citizens, e come testo solo le '
  'colonne _anon: mai raw_text, mai document_url, mai `reason` grezzo, mai il '
  'nome di chi ha risposto. Una classificazione sbagliata pubblicata fa '
  'dichiarare che un comune ha ignorato una richiesta a cui aveva risposto: '
  'per questo la conferma umana è una condizione, non un passaggio di qualità.';


-- ============================================================================
-- 7. CONFRONTO FRA COMUNI (PLAN2 §6.2)
--
-- È la pagina che dà senso a tutto il resto: chi risponde e chi no, con i
-- tempi. «È l'unico numero che un'amministrazione teme davvero», e diventa
-- possibile solo adesso, perché prima nessuno leggeva le risposte.
--
-- Tre cautele scritte nella vista, non lasciate al buon senso di chi la legge:
--   · si contano SOLO le risposte confermate da una persona. Una risposta
--     letta male da un modello e mai controllata farebbe apparire come muto un
--     comune che ha risposto;
--   · niente atti o gruppi sintetici, come in ogni superficie pubblica;
--   · SOLO gruppi sopra la soglia min_public_citizens. Su Milano non cambia
--     niente; in un comune di duemila abitanti dove l'unico gruppo ha due
--     firmatari e nessuna pagina pubblica, la riga «Comune X: 1 atto inviato, 0
--     risposte» è la conferma che qualcuno lì ha scritto — e la cerchia dei
--     candidati, in un paese piccolo, è corta. È la stessa logica per cui la
--     soglia esiste: nessuno viene nominato, ma il gruppo si restringe
--     abbastanza da indicare. Qui pesa più che altrove, perché il dato viene
--     aggregato per COMUNE e messo in una pagina di confronto, che è il
--     contesto in cui una riga isolata parla.
--
-- Nessun dato personale, per costruzione: qui si valutano istituzioni, che è
-- esattamente il contrario di valutare persone (PLAN2 §7).
-- ============================================================================

drop view if exists public.public_city_responsiveness;

create view public.public_city_responsiveness as
  with atti as (
    select a.id,
           c.city,
           a.submitted_at
      from public.actions a
      join public.clusters c on c.id = a.cluster_id
     where a.is_synthetic = false
       and c.is_synthetic = false
       and a.status in ('inviata', 'risposta_ricevuta')
       and c.citizens_count >= public.config_int('min_public_citizens')
  ),
  -- La PRIMA risposta confermata: se un comune risponde tre volte, il tempo di
  -- risposta è quello della prima, non la media delle sue lettere.
  prima_risposta as (
    select distinct on (r.action_id)
           r.action_id,
           r.received_at,
           r.classification
      from public.action_responses r
     where r.confirmed_by is not null
       and r.classification is not null
     order by r.action_id, r.received_at asc
  )
  select atti.city,
         count(*)::int                                as actions_sent,
         count(pr.action_id)::int                     as responses_confirmed,

         -- Tempo medio in giorni. Il filtro scarta le righe senza submitted_at
         -- e quelle con date incoerenti (una risposta protocollata prima
         -- dell'invio è un errore di inserimento, non un comune fulmineo).
         round(
           (
             avg(
               extract(epoch from (pr.received_at - atti.submitted_at)) / 86400.0
             ) filter (
               where atti.submitted_at is not null
                 and pr.received_at >= atti.submitted_at
             )
           )::numeric,
           1
         )                                            as avg_response_days,

         count(*) filter (where pr.classification = 'accolta')::int       as accolte,
         count(*) filter (where pr.classification = 'respinta')::int      as respinte,
         count(*) filter (where pr.classification = 'interlocutoria')::int as interlocutorie,
         count(*) filter (where pr.classification = 'irricevibile')::int  as irricevibili
    from atti
    left join prima_risposta pr on pr.action_id = atti.id
   group by atti.city;

grant select on public.public_city_responsiveness to anon, authenticated;

comment on view public.public_city_responsiveness is
  'Quanto rispondono i comuni: atti inviati, risposte confermate, tempo medio '
  'in giorni e distribuzione degli esiti. Conta SOLO le risposte confermate da '
  'una persona — una lettura automatica sbagliata farebbe apparire muto un '
  'comune che ha risposto. Valuta istituzioni, mai cittadini.';


-- ============================================================================
-- 8. CRONOLOGIA DEL GRUPPO (PLAN2 §3.3)
--
-- Un gruppo oggi è una fotografia: titolo, riassunto, contatori. Chi lo apre
-- non sa quando è iniziato, come è cresciuto, cosa è successo dopo l'invio
-- dell'atto. Per un cittadino è la differenza fra «c'è una pagina» e «sta
-- succedendo qualcosa»; per un giornalista è la differenza fra un dato e una
-- storia.
--
-- Markdown e non testo strutturato perché la cronologia la scrive un modello a
-- partire da fatti già pubblici (date, contatori, stati degli atti) e la
-- rendono le stesse pagine che già usano react-markdown. Nessuna informazione
-- nuova entra da qui: se un fatto non era pubblicabile prima, non lo diventa
-- perché è dentro una cronologia.
-- ============================================================================

alter table public.clusters
  add column if not exists timeline_markdown   text,
  add column if not exists timeline_updated_at timestamptz;

comment on column public.clusters.timeline_markdown is
  'Cronologia del gruppo in Markdown, rigenerata da un job. Si costruisce solo '
  'su fatti GIÀ pubblici: date, contatori, stati degli atti, risposte '
  'confermate. Non può contenere anon_text di una singola segnalazione né '
  'alcun dettaglio che identifichi chi ha scritto.';

comment on column public.clusters.timeline_updated_at is
  'Ultima rigenerazione. Serve al job per non richiamare il modello su gruppi '
  'fermi: una chiamata per gruppo al giorno, non per pagina vista.';


-- ============================================================================
-- 9. BRIGADING (PLAN2 §5.2)
--
-- Venti segnalazioni quasi identiche da venti account nuovi non sono un
-- movimento: sono una campagna. Il rate limit protegge dal singolo che scrive
-- trenta volte, non da trenta account che scrivono una volta ciascuno.
--
-- IL LIMITE INVALICABILE, che decide la forma di questa funzione.
-- Nessun punteggio di affidabilità sulle persone. Mai. Si valuta il GRUPPO,
-- mai il cittadino. Un punteggio per persona classificherebbe chi scrive male
-- o è arrabbiato come meno credibile, cioè l'esatto opposto della missione
-- (PLAN2 §7, prima riga della tabella «cosa NON costruire»). Per questo la
-- funzione prende un cluster e restituisce numeri sul cluster: non esiste, e
-- non deve esistere, una versione che accetti un citizen_id.
--
-- E l'esito è REVISIONE UMANA, non blocco. Il flag alza una mano, non chiude
-- una bocca: le viste pubbliche NON filtrano review_flag, perché la voce dei
-- cittadini non si sospende su un sospetto statistico. Il flag blocca la
-- GENERAZIONE DEGLI ATTI: un atto costruito su una campagna coordinata
-- danneggia chi l'ha firmato in buona fede, una pagina di gruppo no.
--
-- E lo blocca QUI, con un trigger, non «nel codice applicativo». La prima
-- stesura di questa sezione affidava il rispetto del flag all'applicazione, e
-- l'applicazione non lo rispettava: `review_flag` non compariva in una sola
-- riga di apps/web, né in generateDossier() né nell'endpoint interno che genera
-- gli atti a richiesta. La difesa esisteva solo come commento. Vale qui la
-- stessa dottrina scritta due sezioni sopra a proposito della quarantena: una
-- regola applicativa si aggira per distrazione, un trigger no.
-- ============================================================================

alter table public.clusters
  add column if not exists review_flag   boolean not null default false,
  add column if not exists review_reason text,
  add column if not exists reviewed_by   text,
  add column if not exists reviewed_at   timestamptz;

create index if not exists clusters_review_flag_idx
  on public.clusters (review_flag, updated_at desc)
  where review_flag = true;

comment on column public.clusters.review_flag is
  'Il gruppo è in attesa di revisione umana per segnali di coordinamento. NON '
  'lo nasconde al pubblico: le viste pubbliche non filtrano questa colonna, '
  'perché PLAN2 §5.2 prescrive revisione del gruppo e non blocco automatico. '
  'Blocca la GENERAZIONE DEGLI ATTI, che è dove il danno sarebbe reale, e lo fa '
  'dal trigger actions_before_insert_review: non è una regola applicativa.';

comment on column public.clusters.review_reason is
  'Perché è stato alzato il flag, in italiano leggibile. Un flag senza motivo '
  'non è revisionabile da nessuno. PRIVATO: contiene un sospetto non '
  'verificato su un gruppo di persone («dodici account creati lo stesso '
  'giorno») e non compare in nessuna vista pubblica.';

-- ---------------------------------------------------------------------------
-- Il flag blocca davvero: nessun atto nasce su un gruppo in revisione
-- ---------------------------------------------------------------------------

create or replace function public.block_actions_on_flagged_cluster()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.clusters c
     where c.id = new.cluster_id
       and c.review_flag
  ) then
    raise exception
      'gruppo % in revisione per sospetto coordinamento: nessun atto può essere generato',
      new.cluster_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Solo BEFORE INSERT, e non anche UPDATE: un atto già esistente su un gruppo
-- che viene segnalato dopo deve restare modificabile, altrimenti chi rivede non
-- può né archiviarlo né correggerlo — cioè il flag bloccherebbe proprio la
-- revisione che è il suo unico scopo.
drop trigger if exists actions_before_insert_review on public.actions;
create trigger actions_before_insert_review
  before insert on public.actions
  for each row execute function public.block_actions_on_flagged_cluster();

revoke all on function public.block_actions_on_flagged_cluster()
  from public, anon, authenticated;

comment on function public.block_actions_on_flagged_cluster is
  'Impedisce la creazione di atti su un gruppo con review_flag. Esiste perché '
  'la promessa «il flag blocca la generazione degli atti» era affidata al '
  'codice applicativo, che non la manteneva: un gruppo montato da venti account '
  'coordinati produceva comunque un esposto, poi firmato da cittadini in buona '
  'fede. La generazione fallisce rumorosamente: meglio un atto mancato che un '
  'atto costruito su una campagna.';

create or replace function public.cluster_brigading_signals(target uuid)
returns table (
  n_reports                int,
  n_citizens               int,
  n_citizens_nuovi         int,
  quota_stessa_ora         double precision,
  similarita_media_interna double precision
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with r as (
    select rp.id, rp.citizen_id, rp.created_at
      from public.reports rp
     where rp.cluster_id = target
  ),
  primo as (
    select min(r.created_at) as t from r
  ),
  ore as (
    select date_trunc('hour', r.created_at) as ora, count(*) as n
      from r
     group by 1
  ),
  -- La similarità interna è un confronto a coppie: su un gruppo grande
  -- sarebbe O(n²) su vettori da 1536 dimensioni. Si campionano le prime 80
  -- segnalazioni in ordine cronologico — se una campagna c'è, è lì che si
  -- vede, ed è meglio un segnale calcolato in fretta di un segnale esatto che
  -- nessuno lancia mai perché blocca il database.
  campione as (
    select r.id from r order by r.created_at asc limit 80
  ),
  coppie as (
    select avg(1 - (ea.embedding <=> eb.embedding)) as media
      from campione ca
      join campione cb on cb.id > ca.id
      join public.report_embeddings ea on ea.report_id = ca.id
      join public.report_embeddings eb on eb.report_id = cb.id
  )
  select
    (select count(*) from r)::int,
    (select count(distinct r.citizen_id) from r)::int,

    -- Cittadini il cui account è nato a ridosso del primo report del gruppo
    -- (±24 ore). È un segnale sul gruppo: dice «questi account sono comparsi
    -- insieme», non «questa persona è sospetta».
    (
      select count(*)::int
        from public.citizens c
       where c.id in (select r.citizen_id from r where r.citizen_id is not null)
         and abs(extract(epoch from (c.created_at - (select primo.t from primo)))) <= 86400
    ),

    -- Frazione di segnalazioni concentrate nell'ora solare più affollata.
    -- Un problema vero arriva distribuito nei giorni; una campagna arriva in
    -- un pomeriggio.
    coalesce(
      (select max(ore.n) from ore)::double precision
        / nullif((select count(*) from r), 0)::double precision,
      0
    ),

    -- Similarità coseno media fra le segnalazioni del gruppo. Alta significa
    -- testi quasi identici, cioè copiati o generati — non venti persone che
    -- raccontano lo stesso problema con parole proprie.
    coalesce((select coppie.media from coppie)::double precision, 0);
$$;

revoke all on function public.cluster_brigading_signals(uuid)
  from public, anon, authenticated;
grant execute on function public.cluster_brigading_signals(uuid) to service_role;

comment on function public.cluster_brigading_signals is
  'Segnali aggregati di coordinamento SUL GRUPPO: quante segnalazioni, quanti '
  'cittadini, quanti account nati a ridosso del primo report, quanta '
  'concentrazione oraria, quanta somiglianza fra i testi. '
  'LIMITE INVALICABILE: non esiste e non deve esistere una versione che '
  'restituisca un punteggio su una persona. Si valuta il gruppo, mai il '
  'cittadino — un punteggio di affidabilità peserebbe di meno chi scrive male '
  'o è arrabbiato, cioè l''opposto della missione. Riservata a service_role '
  'perché legge segnalazioni e date di iscrizione scavalcando la RLS.';


-- ============================================================================
-- 10. AMMINISTRAZIONE
--
-- Serve un pannello per svuotare la quarantena, rivedere i gruppi segnalati e
-- confermare le risposte della PA. Serve quindi un modo di dire «questa
-- sessione è di un amministratore» — e serve che quel modo NON diventi una
-- chiave passe-partout sui dati dei cittadini.
--
-- Il principio, applicato policy per policy: l'amministratore vede il testo
-- grezzo SOLO dove serve per moderare. Non ha alcuna ragione di leggere le
-- segnalazioni sane, e `reports.raw_text` può contenere nomi, indirizzi,
-- condizioni di salute, il racconto di una violenza. Un pannello che mostra
-- tutto trasforma un ruolo di servizio in un potere di sorveglianza sul
-- quartiere che dovrebbe difendere.
--
-- Su `citizens` NON esiste alcuna policy per l'amministratore, ed è una scelta,
-- non una dimenticanza: l'identità dei cittadini (telefono, telegram_id,
-- email, nome) non serve a moderare un testo né a confermare una risposta. Chi
-- amministra VOCE non deve poter sapere CHI ha scritto una segnalazione. Se un
-- giorno servisse davvero (un obbligo di legge, una richiesta dell'autorità),
-- deve essere un'operazione deliberata con service role e tracciata, non una
-- select che parte da una pagina web.
-- ============================================================================

create table if not exists public.admins (
  id           uuid primary key default gen_random_uuid(),

  -- on delete set null e non cascade: se l'account di autenticazione sparisce,
  -- la riga di amministrazione resta e va ricollegata. Cancellarla in silenzio
  -- toglierebbe l'accesso senza che nessuno sappia perché.
  auth_user_id uuid unique references auth.users(id) on delete set null,

  email        text not null unique,
  full_name    text not null,

  -- Finestra entro cui questa riga può essere collegata a una sessione. Vedi
  -- il ragionamento esteso davanti a link_current_admin(): senza, la sicurezza
  -- del collegamento dipende da un flag di configurazione di GoTrue che vive
  -- fuori da questo repo.
  link_allowed_until timestamptz,

  created_at   timestamptz not null default now(),
  last_seen_at timestamptz
);

alter table public.admins
  add column if not exists link_allowed_until timestamptz;

alter table public.admins enable row level security;
revoke all on table public.admins from anon;

drop policy if exists admin_self_read on public.admins;
create policy admin_self_read on public.admins
  for select to authenticated
  using (auth_user_id = (select auth.uid()));

-- Nessuna insert, nessuna update, nessuna delete dai client: gli amministratori
-- si aggiungono con service role. Un pannello che può creare amministratori è
-- un pannello dove un amministratore compromesso ne crea altri dieci.

comment on table public.admins is
  'Chi può usare il pannello di moderazione. Le righe si creano con service '
  'role PRIMA che la persona abbia mai fatto login: al primo accesso, '
  'link_current_admin() collega auth_user_id confrontando l''email verificata.';

comment on column public.admins.auth_user_id is
  'Collegamento a auth.users, null finché la persona non ha fatto il primo '
  'login. È questa colonna, non l''email, a decidere is_admin(): un''email in '
  'tabella non basta a diventare amministratori, serve una sessione reale su '
  'un indirizzo confermato e un invito aperto.';

comment on column public.admins.link_allowed_until is
  'Finestra di collegamento: link_current_admin() lavora solo su righe con '
  'questo valore nel futuro, e lo azzera al primo uso. Chi inserisce la riga '
  'con service role lo valorizza per il tempo strettamente necessario, es. '
  'now() + interval ''48 hours''. Serve perché la sola verifica dell''email '
  'confermata non protegge nulla quando GoTrue è configurato con '
  'mailer_autoconfirm: lì email_confirmed_at è valorizzata all''istante della '
  'registrazione, senza che nessuna posta sia stata né mandata né letta.';

-- ---------------------------------------------------------------------------
-- is_admin(): la sola domanda che le policy fanno
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.admins where auth_user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

comment on function public.is_admin is
  'Vero se la sessione corrente appartiene a un amministratore collegato. '
  'SECURITY DEFINER perché `admins` è leggibile solo per la propria riga. '
  'Revocata da public e anon: senza sessione la risposta è sempre no, e '
  'lasciarla a PUBLIC la esporrebbe come RPC HTTP a chiunque (vedi la nota in '
  '0003_rls.sql).';

-- ---------------------------------------------------------------------------
-- link_current_admin(): il primo login
--
-- Un amministratore viene inserito in tabella PRIMA di aver mai fatto login —
-- è l'unico ordine possibile, perché l'account nasce dall'accesso OTP e
-- l'accesso OTP deve già sapere chi lasciare entrare. Questa funzione salda i
-- due mondi al primo ingresso.
--
-- LE QUATTRO CONDIZIONI, E PERCHÉ LE PRIME DUE NON BASTANO.
--
--   1. si collega SOLO una riga con auth_user_id ancora null. Senza questo, chi
--      registrasse un account con l'email di un amministratore già collegato
--      ne prenderebbe il posto;
--   2. l'email deve risultare CONFERMATA su auth.users;
--   3. l'indirizzo si legge da `auth.users`, non dal claim `email` del JWT. Il
--      claim è ciò che l'utente ha dichiarato, la riga è ciò che GoTrue ha
--      registrato: sono la stessa cosa finché qualcuno non fa in modo che non
--      lo siano. Si scarta anche chi ha un cambio di indirizzo a metà
--      (email_change_confirm_status <> 0), che è lo stato in cui le due
--      versioni dell'email convivono;
--   4. la riga di `admins` deve avere una FINESTRA DI COLLEGAMENTO aperta.
--
-- La quarta condizione esiste perché le prime due, da sole, non proteggono
-- niente in questo progetto. `supabase/config.toml` ha oggi
-- `enable_confirmations = false` con `enable_signup = true`: con
-- mailer_autoconfirm attivo GoTrue valorizza `email_confirmed_at` all'istante
-- della registrazione, senza mandare né verificare alcuna posta. La condizione
-- «email confermata» è quindi SEMPRE vera, e chiunque indovini l'indirizzo di
-- un amministratore non ancora collegato — indirizzi che sono spesso pubblici —
-- si registra con la chiave anon, chiama questa funzione e ottiene raw_text
-- delle segnalazioni in moderazione, i vocali in revisione, tutti i gruppi e
-- tutti gli atti.
--
-- Una funzione di auto-promozione raggiungibile da ogni sessione non può
-- reggersi su un flag di configurazione che vive in un altro file e che il
-- pannello Supabase può sovrascrivere. La finestra riporta la decisione dove
-- deve stare: qualcuno con service role apre l'invito quando invita la persona,
-- e l'invito si consuma al primo uso. Un amministratore in più all'anno non
-- vale una porta sempre aperta.
--
-- Confronto case-insensitive perché le caselle di posta lo sono, e una
-- maiuscola di differenza non deve chiudere fuori chi di dovere.
-- ---------------------------------------------------------------------------

create or replace function public.link_current_admin()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid        uuid := (select auth.uid());
  mail       text;
  toccate    int;
begin
  if uid is null then
    return false;
  end if;

  select lower(nullif(btrim(u.email), ''))
    into mail
    from auth.users u
   where u.id = uid
     and u.email_confirmed_at is not null
     and coalesce(u.email_change_confirm_status, 0) = 0;

  if mail is null then
    -- Nessun indirizzo confermato e stabile su questa sessione: nessun
    -- collegamento. Un claim non confermato non è un'identità.
    return false;
  end if;

  update public.admins a
     set auth_user_id       = uid,
         last_seen_at       = now(),
         -- L'invito si consuma: vale una volta sola, per una persona sola.
         link_allowed_until = null
   where lower(a.email) = mail
     and a.auth_user_id is null
     and a.link_allowed_until is not null
     and a.link_allowed_until > now();

  get diagnostics toccate = row_count;

  if toccate > 0 then
    return true;
  end if;

  -- Già collegato: aggiorniamo solo la presenza, così il pannello sa chi è
  -- stato attivo di recente.
  update public.admins a
     set last_seen_at = now()
   where a.auth_user_id = uid;

  get diagnostics toccate = row_count;
  return toccate > 0;
end;
$$;

revoke all on function public.link_current_admin() from public, anon;
grant execute on function public.link_current_admin() to authenticated;

comment on function public.link_current_admin is
  'Collega la sessione corrente alla riga di admins con la stessa email, solo '
  'se auth_user_id è ancora null, solo se l''indirizzo risulta confermato e '
  'stabile su auth.users (letto da lì, non dal claim del JWT) e solo se '
  'link_allowed_until è aperta. Serve perché un amministratore esiste in '
  'tabella prima di aver mai fatto login. La finestra non è burocrazia: con '
  'mailer_autoconfirm la verifica dell''email è sempre vera, quindi senza di '
  'essa chi indovina l''indirizzo di un amministratore diventa amministratore.';

-- ---------------------------------------------------------------------------
-- Helper per le policy sui media: la segnalazione collegata è in moderazione?
--
-- SECURITY DEFINER di proposito: valutare questa condizione con una subquery
-- dentro la policy di report_media farebbe applicare a sua volta la RLS di
-- `reports`, incatenando due insiemi di policy per ogni riga di media. Una
-- funzione dedicata rende la regola leggibile e la dipendenza esplicita.
--
-- IL GRANT A `authenticated` È NECESSARIO, LA RISPOSTA APERTA A TUTTI NO.
-- Le espressioni delle policy si valutano con i privilegi del chiamante, quindi
-- senza quel grant la policy di report_media non funzionerebbe. Ma in Supabase
-- ogni funzione di `public` è anche una RPC HTTP: nella prima stesura questa
-- rispondeva a chiunque avesse una sessione, su qualunque report id — e gli id
-- non sono segreti, `public_cluster_reports` pubblica `r.id` di ogni
-- segnalazione dei gruppi pubblici. Un utente qualsiasi poteva quindi scoprire
-- quali segnalazioni pubbliche sono state marcate come offensive: un giudizio
-- sul contenuto di una persona, mai pensato per essere pubblico e ottimo
-- materiale per una ritorsione mirata.
--
-- Il gate `public.is_admin() and ...` chiude l'oracolo senza toccare la policy:
-- per un non amministratore la risposta è sempre falsa, e la policy di
-- report_media — che è già dentro un `is_admin() and ...` — si comporta
-- esattamente come prima.
-- ---------------------------------------------------------------------------

create or replace function public.report_is_under_moderation(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_admin() and exists (
    select 1
      from public.reports r
     where r.id = target
       and (r.status = 'quarantena' or r.moderation_flagged = true)
  );
$$;

revoke all on function public.report_is_under_moderation(uuid) from public, anon;
grant execute on function public.report_is_under_moderation(uuid)
  to authenticated, service_role;

comment on function public.report_is_under_moderation is
  'Vero se chi chiede è amministratore E la segnalazione è in quarantena o '
  'segnalata dalla moderazione. Usata dalla policy di report_media per '
  'limitare l''amministratore ai soli media che ha ragione di aprire. Il primo '
  'termine non è ridondante con la policy: senza, la funzione è una RPC che '
  'dice a chiunque abbia una sessione quali segnalazioni pubbliche sono state '
  'segnalate come offensive.';

-- ---------------------------------------------------------------------------
-- Policy dell'amministratore — minime e motivate una per una
-- ---------------------------------------------------------------------------

-- SEGNALAZIONI — solo quelle in moderazione, e quelle che l'amministratore ha
-- già rivisto firmandole.
--
-- raw_text può contenere nomi, indirizzi, condizioni di salute, il racconto di
-- una violenza. Un amministratore non ha alcuna ragione di leggere le
-- segnalazioni sane, e questa policy è ciò che glielo impedisce.
--
-- Sull'UPDATE, due cose non ovvie.
--
-- 1. La clausola USING è valutata sulla riga PRIMA della modifica: un
--    amministratore non può mettere in quarantena una segnalazione sana per poi
--    leggerla, perché non può aggiornarla affatto. La quarantena non è una
--    chiave che si gira da soli.
--
-- 2. `moderation_reviewed_by is not null` nel terzo ramo NON è un di più.
--    Postgres, quando una tabella ha policy di SELECT, pretende che la riga
--    RISULTANTE da un update sia ancora visibile a chi lo esegue, altrimenti
--    respinge con «new row violates row-level security policy». Senza quel
--    ramo, `update reports set status='triaged'` da parte di un amministratore
--    fallirebbe sempre: la riga uscirebbe dalla moderazione e quindi dalla sua
--    visibilità. La quarantena sarebbe una porta a senso unico, e ogni falso
--    positivo su dialetto o turpiloquio resterebbe bloccato per sempre.
--    (Verificato sul database locale: senza questo ramo l'update fallisce.)
--
--    L'effetto collaterale è una regola che volevamo comunque: per togliere una
--    segnalazione dalla quarantena bisogna FIRMARE la decisione. Una revisione
--    senza il nome di chi l'ha fatta è una decisione senza responsabile.
--
--    Il prezzo è che una segnalazione già rivista resta leggibile
--    dall'amministratore anche dopo. Non aggiunge esposizione — quel testo lo
--    ha già letto per deciderne la sorte — e serve a poter tornare su una
--    decisione presa ieri.
drop policy if exists admin_reports_moderation_read on public.reports;
create policy admin_reports_moderation_read on public.reports
  for select to authenticated
  using (
    public.is_admin()
    and (
      status = 'quarantena'
      or moderation_flagged = true
      or moderation_reviewed_by is not null
    )
  );

drop policy if exists admin_reports_moderation_update on public.reports;
create policy admin_reports_moderation_update on public.reports
  for update to authenticated
  using (
    public.is_admin()
    and (status = 'quarantena' or moderation_flagged = true)
  )
  with check (
    public.is_admin()
    and (
      status = 'quarantena'
      or moderation_flagged = true
      -- Uscita dalla moderazione: si può, ma va firmata.
      or moderation_reviewed_by is not null
    )
  );

-- MEDIA — stesso perimetro, stesso motivo, alzato di un grado: un vocale è un
-- dato biometrico e una foto può contenere volti e targhe. Nessun update:
-- un media non si corregge, semmai si cancella con service role.
drop policy if exists admin_report_media_read on public.report_media;
create policy admin_report_media_read on public.report_media
  for select to authenticated
  using (
    public.is_admin()
    and public.report_is_under_moderation(report_id)
  );

-- GRUPPI — nessun dato personale: titolo, riassunto, contatori, flag di
-- revisione. L'amministratore li vede tutti, anche sotto la soglia pubblica,
-- perché il suo lavoro è proprio decidere sui gruppi che il pubblico non vede.
drop policy if exists admin_clusters_read on public.clusters;
create policy admin_clusters_read on public.clusters
  for select to authenticated
  using (public.is_admin());

drop policy if exists admin_clusters_update on public.clusters;
create policy admin_clusters_update on public.clusters
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- LA RLS NON SA FILTRARE COLONNE, e qui la differenza è tutta.
-- `using (is_admin())` significa «può aggiornare qualunque campo». Le policy
-- sulle segnalazioni sono state ritagliate riga per riga e poi su `clusters` si
-- concedeva tutto: portare `citizens_count` a 99 rende pubblico all'istante,
-- via public_clusters, un gruppo da un solo cittadino — con titolo, riassunto e
-- centroide. Cioè si scavalca la soglia di privacy con una UPDATE da una pagina
-- web. Riscrivere `centroid` sposta la mappa; `is_synthetic = false` immette un
-- gruppo di prova nel flusso civico. Nessuna di queste operazioni serve a
-- moderare.
--
-- I grant di colonna sono l'unico strumento che la RLS non sostituisce. I
-- contatori restano di competenza esclusiva dei trigger, che è l'unico posto
-- dove sono veri.
revoke update on public.clusters from authenticated;
grant update (
  review_flag, review_reason, reviewed_by, reviewed_at,
  status, title, summary, category, neighborhood
) on public.clusters to authenticated;

-- ATTI — la revisione umana avviene qui. L'update è il gesto con cui una
-- persona firma `reviewed_by` e si assume la responsabilità del testo.
-- Il vincolo actions_review_before_send resta l'ultima parola: nessuna policy
-- lo indebolisce, e un atto senza revisore non raggiunge 'inviata' nemmeno
-- passando da qui.
--
-- MA `reviewed_by` DECIDE ANCHE LA PUBBLICAZIONE, e questo cambia il peso della
-- policy. Il vincolo morde solo sulle transizioni verso 'inviata'; la
-- pubblicazione di `body_markdown` (0008, e §13 qui sotto) dipende dal solo
-- `reviewed_by is not null`. Fino a ieri su `actions` non esisteva NESSUNA
-- policy di update per i client, quindi il punto debole non era raggiungibile;
-- da adesso lo è, e senza altre difese basterebbe `update actions set
-- reviewed_by = ' '` da una pagina web per mettere online il testo generato da
-- un modello, con `reviewed_at` ancora null. Il vincolo e il trigger qui sotto
-- impongono alla firma la stessa disciplina già scritta per le risposte della
-- PA: una firma è un nome e una data, e una firma fatta di spazi non è una
-- firma.
update public.actions
   set reviewed_by = nullif(btrim(reviewed_by), '')
 where reviewed_by is not null
   and btrim(reviewed_by) = '';

update public.actions
   set reviewed_at = coalesce(reviewed_at, now())
 where reviewed_by is not null
   and reviewed_at is null;

update public.actions
   set reviewed_at = null
 where reviewed_by is null
   and reviewed_at is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname  = 'actions_reviewed_pair'
       and conrelid = 'public.actions'::regclass
  ) then
    alter table public.actions
      add constraint actions_reviewed_pair check (
        (reviewed_by is null) = (reviewed_at is null)
        and (reviewed_by is null or btrim(reviewed_by) <> '')
      );
  end if;
end
$$;

create or replace function public.before_action_review()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.reviewed_by := nullif(btrim(coalesce(new.reviewed_by, '')), '');

  if new.reviewed_by is not null and new.reviewed_at is null then
    new.reviewed_at := now();
  end if;

  if new.reviewed_by is null then
    new.reviewed_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists actions_before_review on public.actions;
create trigger actions_before_review
  before insert or update on public.actions
  for each row execute function public.before_action_review();

revoke all on function public.before_action_review() from public, anon, authenticated;

comment on function public.before_action_review is
  'Normalizza la firma della revisione: toglie gli spazi, mette la data da sé, '
  'e azzera la data se il nome sparisce. Serve perché `reviewed_by` non traccia '
  'soltanto: è la colonna che rende pubblico body_markdown.';

drop policy if exists admin_actions_read on public.actions;
create policy admin_actions_read on public.actions
  for select to authenticated
  using (public.is_admin());

drop policy if exists admin_actions_update on public.actions;
create policy admin_actions_update on public.actions
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Stesso ragionamento fatto per `clusters`: la RLS non filtra colonne, e su un
-- atto già protocollato non c'è ragione di poter riscrivere `is_synthetic`,
-- `cluster_id`, i contatori delle firme o `response_text` (che è pubblico via
-- public_actions e non passa da alcuna anonimizzazione).
-- `submitted_at` invece resta scrivibile: è il pannello a registrare l'invio, e
-- senza quella data il termine di legge non si calcola.
revoke update on public.actions from authenticated;
grant update (
  reviewed_by, reviewed_at, status, body_markdown, title,
  recipient, recipient_endpoint_id, submitted_at,
  deadline_at, deadline_days, deadline_basis, signatures_target
) on public.actions to authenticated;

-- RISPOSTE DELLA PA — leggere, caricare, classificare e confermare è
-- esattamente il lavoro del pannello. Nessuna delete: una risposta ricevuta è
-- un fatto, e cancellarla riscriverebbe la storia di un atto.
drop policy if exists admin_action_responses_read on public.action_responses;
create policy admin_action_responses_read on public.action_responses
  for select to authenticated
  using (public.is_admin());

drop policy if exists admin_action_responses_insert on public.action_responses;
create policy admin_action_responses_insert on public.action_responses
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists admin_action_responses_update on public.action_responses;
create policy admin_action_responses_update on public.action_responses
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- NOTIFICHE — NESSUNA policy per l'amministratore, e va spiegato perché la
-- prima stesura ne aveva una e perché è stata tolta.
--
-- `admin_notifications_read` concedeva SELECT su ogni riga di `notifications`.
-- Ma una riga di notifiche contiene `citizen_id` e `report_id` accanto, per
-- ogni cittadino, comprese le segnalazioni sane che l'amministratore non può
-- leggere; e `dedupe_key` ripete la coppia in chiaro
-- («gruppo_pubblico:<cluster_id>:<citizen_id>»). Bastava una select e un join
-- per ricostruire il grafo completo di chi ha segnalato cosa, in che quartiere,
-- su quale problema. Cioè esattamente ciò che il commento in testa a questa
-- sezione dichiara di voler impedire — «chi amministra VOCE non deve poter
-- sapere CHI ha scritto una segnalazione» — reso una precauzione simbolica da
-- una policy scritta tre schermate più sotto. Nei quartieri candidati di
-- PLAN.md §13 quella mappa è l'informazione che espone una persona a ritorsione.
--
-- Al suo posto c'è una vista di diagnostica che non contiene identificatori:
-- per capire se le consegne funzionano bastano tipo, canale, ora e conteggi.
-- Se serve davvero il dettaglio di una consegna fallita, è un'operazione
-- deliberata con service role e tracciata, come già stabilito per `citizens`.
drop policy if exists admin_notifications_read on public.notifications;

drop view if exists public.admin_notifications_health;

create view public.admin_notifications_health
  with (security_barrier = true) as
  select n.kind,
         n.channel,
         date_trunc('hour', n.created_at)                     as ora,
         count(*)::int                                        as totali,
         count(*) filter (where n.sent_at is not null)::int    as inviate,
         count(*) filter (where n.failed_at is not null)::int  as fallite,
         max(n.attempts)::int                                 as tentativi_max
    from public.notifications n
   where (select public.is_admin())
   group by 1, 2, 3;

revoke all on public.admin_notifications_health from anon;
grant select on public.admin_notifications_health to authenticated;

comment on view public.admin_notifications_health is
  'Salute delle notifiche: quante ne partono, quante falliscono, per tipo, '
  'canale e ora. Non espone citizen_id, report_id, dedupe_key né payload, ed è '
  'l''unica lettura sulle notifiche concessa al pannello: l''elenco riga per '
  'riga sarebbe la mappa di chi ha segnalato cosa. Vista SECURITY DEFINER: il '
  'guard `public.is_admin()` al suo interno è ciò che la chiude a chiunque '
  'altro sia autenticato.';

-- CITTADINI — nessuna policy per l'amministratore. Vedi il commento in testa
-- alla §10: l'identità di chi segnala non serve a moderare un testo.

-- ---------------------------------------------------------------------------
-- Viste del pannello
--
-- TRE DIFESE, PERCHÉ LA PRIMA STESURA NE AVEVA UNA SOLA E PER SBAGLIO.
--
-- 1. `security_invoker = true`. Nella prima stesura queste viste giravano con i
--    privilegi del proprietario e scavalcavano la RLS: l'unica cosa che fermava
--    un utente qualsiasi era il `where public.is_admin()` scritto a mano dentro
--    ciascuna. Con security_invoker è la RLS a decidere — le policy admin_*
--    appena create danno all'amministratore esattamente le stesse righe — e il
--    guard torna a essere quello che deve essere: difesa in profondità, non
--    unica difesa. Dentro ci sono titolo, riassunto, città e quartiere di TUTTI
--    i gruppi, anche sotto la soglia min_public_citizens, più destinatario e
--    revisore di ogni atto.
--
-- 2. `security_barrier = true`. Il guard è un qual pseudo-costante: senza
--    barriera, la sua valutazione prima dei predicati del chiamante è il
--    comportamento attuale del planner, non un contratto. Basta un predicato
--    ostile con una funzione non-leakproof a costo basso perché l'ordine
--    smetta di essere quello che ci si aspetta.
--
-- 3. `revoke ... from anon`. Il privilegio di default di Supabase concede SELECT
--    ad anon su ogni oggetto nuovo di `public`, e la prima stesura lo revocava
--    sulle tabelle ma non su queste due viste: l'unica cosa che fermava anon
--    era un `permission denied for function is_admin` — un effetto collaterale,
--    non una decisione. Il giorno in cui qualcuno concedesse EXECUTE su
--    is_admin() ad anon per far comparire un pulsante, entrambe le viste
--    sarebbero leggibili senza sessione. E intanto, via PostgREST, anon riceve
--    un 500 con il nome di una funzione interna invece di un 401.
--
-- `(select public.is_admin())` e non `public.is_admin()`: la subquery viene
-- valutata una volta per statement invece che una volta per riga, come già
-- fatto con `auth.uid()` nelle policy di 0003.
-- ---------------------------------------------------------------------------

drop view if exists public.admin_clusters_overview;

create view public.admin_clusters_overview
  with (security_invoker = true, security_barrier = true) as
  select c.id,
         c.title,
         c.category,
         c.city,
         c.neighborhood,
         c.status,
         c.reports_count,
         c.citizens_count,
         c.review_flag,
         c.review_reason,
         c.reviewed_by,
         c.reviewed_at,
         c.is_synthetic,
         c.timeline_updated_at,
         (c.citizens_count >= public.config_int('min_public_citizens'))
                                                                as e_pubblico,
         count(a.id) filter (where a.status = 'bozza')::int      as atti_bozza,
         count(a.id) filter (where a.reviewed_by is not null)::int as atti_revisionati,
         count(a.id)::int                                        as atti_totali,
         c.created_at,
         c.updated_at
    from public.clusters c
    left join public.actions a on a.cluster_id = c.id
   where (select public.is_admin())
   group by c.id;

revoke all on public.admin_clusters_overview from anon;
grant select on public.admin_clusters_overview to authenticated;

comment on view public.admin_clusters_overview is
  'Coda di lavoro dell''amministratore sui gruppi: contatori, flag di '
  'revisione, atti in bozza. Tre difese sovrapposte: security_invoker (decide '
  'la RLS), security_barrier (decide l''ordine di valutazione), revoca ad anon. '
  'Il `where public.is_admin()` resta come quarta. Non espone nessun testo di '
  'segnalazione e nessuna identità.';

drop view if exists public.admin_actions_queue;

create view public.admin_actions_queue
  with (security_invoker = true, security_barrier = true) as
  select a.id,
         a.cluster_id,
         c.title                                     as cluster_title,
         c.city,
         c.review_flag                               as cluster_review_flag,
         a.kind,
         a.status,
         a.title,
         a.recipient,
         a.reviewed_by,
         a.reviewed_at,
         a.submitted_at,
         a.deadline_at,
         a.deadline_days,
         a.deadline_basis,
         a.follow_up_of_action_id,
         a.follow_up_generated_at,
         a.response_received_at,
         a.signatures_count,
         a.signatures_target,
         a.is_synthetic,
         count(r.id) filter (where r.confirmed_by is null)::int as risposte_da_confermare,
         count(r.id)::int                                       as risposte_totali,
         a.created_at
    from public.actions a
    join public.clusters c on c.id = a.cluster_id
    left join public.action_responses r on r.action_id = a.id
   where (select public.is_admin())
   group by a.id, c.title, c.city, c.review_flag;

revoke all on public.admin_actions_queue from anon;
grant select on public.admin_actions_queue to authenticated;

comment on view public.admin_actions_queue is
  'Coda degli atti: stato, revisione, termine di legge, risposte ancora da '
  'confermare. Stesse tre difese di admin_clusters_overview, più il guard '
  '`public.is_admin()`. Non espone action_responses.raw_text né `reason`: la '
  'lettura del testo di una risposta passa dalla tabella e dalla sua policy.';


-- ============================================================================
-- 11. RICERCA SEMANTICA PUBBLICA (PLAN2 §4.1, §4.2)
--
-- Gli embedding ci sono già, la ricerca no. «Qualcuno ha già segnalato le buche
-- in via Ferrari?» oggi non ha risposta, e il risultato è che chi cerca apre un
-- problema parallelo invece di trovare i suoi vicini. Due gruppi da tre persone
-- non raggiungono mai la soglia; un gruppo da sei sì.
--
-- LA DIFFERENZA CON match_similar_reports, che è tutto il senso di questa
-- funzione. Quella restituisce report_id, cluster_id e citizen_id: esposta ad
-- anon permetterebbe di ricostruire chi ha segnalato cosa, ed è infatti
-- riservata a service_role dal 2003_rls. Questa è esposta ad anon e quindi può
-- dire SOLO ciò che è già pubblico: aggrega per gruppo, non restituisce mai un
-- report_id, un citizen_id o un testo di segnalazione, e applica le stesse due
-- condizioni della vista public_clusters — niente sintetici, e soglia
-- config_int('min_public_citizens').
--
-- Il filtro `r.status = 'clustered'` esclude a monte le segnalazioni in
-- quarantena, che hanno uno stato diverso (e che il trigger della §2 stacca
-- comunque dal gruppo).
--
-- IL PUNTEGGIO NON ESCE DA QUI, ED È LA CORREZIONE PIÙ IMPORTANTE DI QUESTA
-- SEZIONE.
-- La prima stesura restituiva `similarity` come float a precisione piena. Ma
-- gli embedding sono calcolati su `clean_text` (apps/web/lib/ai/triage.ts:
-- «Sul clean_text e non sul grezzo»), non su `anon_text`: `clean_text` è la
-- riscrittura formale del racconto e contiene ancora nomi, civici e dettagli
-- identificanti — è privato per costruzione. Un numero continuo che misura la
-- vicinanza fra una frase scelta da chi interroga e quel testo è un oracolo:
-- si prova «incidente in via Ferrari 3», poi «in via Ferrari 5», si guarda
-- quale sale, e con abbastanza tentativi si ricostruisce per bisezione ciò che
-- l'anonimizzazione aveva tolto di proposito. Il massimo per gruppo peggiora la
-- cosa invece di attenuarla: basta una segnalazione ricca di dettagli perché il
-- punteggio del gruppo la rispecchi. In un quartiere dove si segnala spaccio,
-- è lo strumento con cui si scopre chi ha parlato.
--
-- L'ordinamento basta a far trovare i vicini, che è tutto ciò che questa
-- funzione deve fare. Chi vuole un'etichetta in pagina la costruisca dalla
-- posizione nell'elenco, non da un numero.
--
-- I parametri li fissa la funzione, non il chiamante: `match_threshold`
-- accettava anche valori negativi (cioè «restituisci tutto») e `match_count`
-- non aveva tetto. Un oracolo lento e limitato è molto meno utile di uno veloce
-- e illimitato. Il resto — un limite per indirizzo IP — va messo davanti, sulla
-- route handler che la espone: il database non sa contare le richieste.
-- ============================================================================

-- Il tipo di ritorno cambia (via `similarity`), e il tipo di ritorno non si
-- sostituisce con `create or replace`.
drop function if exists public.search_public_clusters(vector, int, float, text);

create or replace function public.search_public_clusters(
  query_embedding vector(1536),
  match_count     int   default 10,
  match_threshold float default 0.35,
  filter_city     text  default null
)
returns table (
  cluster_id     uuid,
  title          text,
  summary        text,
  category       text,
  city           text,
  neighborhood   text,
  citizens_count int,
  reports_count  int,
  status         public.cluster_status
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- Ogni riferimento è qualificato con l'alias: i nomi delle colonne di
  -- RETURNS TABLE sono visibili come variabili dentro il corpo, e un
  -- riferimento nudo a `title` o `status` sarebbe ambiguo.
  select c.id,
         c.title,
         c.summary,
         c.category,
         c.city,
         c.neighborhood,
         c.citizens_count,
         c.reports_count,
         c.status
         -- Il punteggio del gruppo — il MASSIMO fra le sue segnalazioni —
         -- resta nell'ORDER BY e non compare fra le colonne restituite. È
         -- l'ordine a dire «questo somiglia di più», senza consegnare a chi
         -- interroga la misura esatta della somiglianza con un testo privato.
    from public.report_embeddings e
    join public.reports  r on r.id = e.report_id
    join public.clusters c on c.id = r.cluster_id
   where c.is_synthetic = false
     and r.is_synthetic = false
     and r.status = 'clustered'
     and r.moderation_flagged = false
     and c.citizens_count >= public.config_int('min_public_citizens')
     and (filter_city is null or c.city = filter_city)
   group by c.id
  having max(1 - (e.embedding <=> query_embedding))
         >= greatest(coalesce(match_threshold, 0.35), 0.35)
   order by max(1 - (e.embedding <=> query_embedding)) desc
   limit least(greatest(coalesce(match_count, 10), 1), 20);
$$;

revoke all on function public.search_public_clusters(vector, int, float, text)
  from public;
grant execute on function public.search_public_clusters(vector, int, float, text)
  to anon, authenticated, service_role;

comment on function public.search_public_clusters is
  'Ricerca semantica sui gruppi GIÀ pubblici. Aggrega per gruppo e non '
  'restituisce mai un report_id, un citizen_id, un testo di segnalazione né il '
  'punteggio di similarità: quest''ultimo è calcolato su clean_text, che è '
  'privato, e un numero continuo su testo privato è un oracolo che si '
  'interroga a bisezione finché non racconta ciò che l''anonimizzazione aveva '
  'tolto. Soglia e limite sono fissati dalla funzione, non dal chiamante. Il '
  'limite per indirizzo IP va messo sulla route handler che la espone.';


-- ============================================================================
-- 12. DOMANDA DI DETTAGLIO (PLAN2 §2.4)
--
-- Oggi, se il triage giudica un messaggio troppo vago, il bot chiede dettagli
-- con un invito generico. Un passo avanti è chiedere LA cosa specifica che
-- manca — «da quanto tempo?», «in che via?» — perché una domanda precisa
-- ottiene una risposta precisa, e una domanda generica ottiene silenzio.
--
-- Questa colonna serve a non farla due volte. Richiedere lo stesso dettaglio a
-- ogni messaggio è il modo più affidabile di far smettere di scrivere una
-- persona, come già visto con la domanda sul comune (0006).
--
-- Il limite, che nessuna colonna può garantire ma che va scritto comunque:
-- VOCE aiuta a raccontare, non racconta al posto del cittadino. Le parole
-- restano sue, o l'atto non è più suo.
-- ============================================================================

alter table public.reports
  add column if not exists follow_up_question text;

comment on column public.reports.follow_up_question is
  'La domanda di dettaglio già posta su questa segnalazione («da quanto '
  'tempo?», «in che via?»). Esiste per non ripeterla: chiedere due volte la '
  'stessa cosa è il modo più affidabile di far smettere di scrivere qualcuno. '
  'La risposta del cittadino integra il racconto, non lo sostituisce.';


-- ============================================================================
-- 13. RICREAZIONE DELLE VISTE
--
-- `public_clusters` va ricreata per esporre la cronologia (§8) e
-- `public_actions` per esporre il termine di legge (§5).
--
-- ATTENZIONE AL PUNTO DI PARTENZA, che è l'errore facile qui: queste viste
-- sono già state ridefinite due volte. `public_clusters` in 0005 (soglia da
-- config_int invece del 3 scritto a mano) e `public_actions` in 0008 (il corpo
-- dell'atto esce solo dopo la revisione umana, più la colonna `revisionato`).
-- Ripartire dalla definizione di 0002 farebbe REGREDIRE la privacy di due
-- migrazioni in un colpo solo, rimettendo online le bozze non revisionate.
-- Le definizioni qui sotto partono dall'ULTIMA valida e aggiungono soltanto.
--
-- `public_platform_stats` non cambia e resta quella di 0005: non si toccano
-- viste che non hanno motivo di cambiare. `public_cluster_reports` e
-- `public_city_stats` invece un motivo ce l'hanno, ed è colpa di questa stessa
-- migrazione:
--
--   · public_cluster_reports filtrava solo `status = 'clustered'`, ma la §2
--     tratta `moderation_flagged` come equivalente alla quarantena. Una riga
--     segnalata dal classificatore e non ancora decisa restava in pagina. Il
--     trigger la stacca già dal gruppo, quindi questo filtro è ridondante — ed
--     è esattamente il tipo di ridondanza che si tiene: costa un AND e copre
--     il giorno in cui qualcuno riattacca una riga a mano;
--
--   · public_city_stats conta gli atti inviati con `status = 'inviata'`. Fino a
--     ieri nessun codice spostava quello stato; dalla §6 in poi ogni risposta
--     confermata porta l'atto a 'risposta_ricevuta', quindi il contatore degli
--     atti inviati DIMINUIREBBE ogni volta che un comune risponde. Su
--     /trasparenza il tasso di risposta (risposte/inviati) esploderebbe oltre
--     il 100% o sparirebbe del tutto, e due viste pubbliche darebbero numeri
--     diversi sullo stesso comune, perché public_city_responsiveness conta già
--     entrambi gli stati. Un atto inviato resta inviato anche dopo la risposta.
-- ============================================================================

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
         -- Cronologia (§8). Costruita su fatti già pubblici: non aggiunge
         -- nulla che non fosse già leggibile su questa stessa pagina.
         c.timeline_markdown,
         date_trunc('hour', c.timeline_updated_at) as timeline_updated_at,
         date_trunc('hour', c.created_at) as created_at,
         date_trunc('hour', c.updated_at) as updated_at
    from public.clusters c
   where c.is_synthetic = false
     and c.citizens_count >= public.config_int('min_public_citizens');
     -- review_flag NON compare fra i filtri, ed è deliberato: PLAN2 §5.2
     -- prescrive «revisione umana del gruppo, non blocco automatico». Il flag
     -- ferma la generazione degli atti, non la voce dei cittadini.

comment on view public.public_clusters is
  'Gruppi visibili al pubblico: sopra la soglia min_public_citizens letta da '
  'config_int(), non sintetici, con centroide arrotondato da '
  'blur_point() e date troncate all''ora. Non filtra review_flag di proposito: '
  'un sospetto di coordinamento fa scattare una revisione umana e blocca gli '
  'atti, non nasconde le persone.';

drop view if exists public.public_actions;

create view public.public_actions as
  select a.id,
         a.cluster_id,
         a.kind,
         a.status,
         a.title,
         -- 0008: il corpo compare solo quando una persona lo ha firmato con
         -- nome e cognome in `reviewed_by`. Prima di allora è null, e la
         -- pagina spiega perché. Questa riga non si tocca.
         case when a.reviewed_by is not null then a.body_markdown else null end
           as body_markdown,
         (a.reviewed_by is not null) as revisionato,
         case when a.reviewed_by is not null then a.pdf_url else null end as pdf_url,
         case when a.reviewed_by is not null then a.docx_url else null end as docx_url,
         a.recipient,
         a.signatures_count,
         a.signatures_target,
         a.reviewed_by,
         a.submitted_at,
         a.response_received_at,
         a.response_text,
         -- Scadenzario (§5). Il termine di legge è informazione pubblica per
         -- definizione: è la norma a fissarlo, e renderlo visibile è metà del
         -- motivo per cui esiste — un termine che solo noi conosciamo non fa
         -- pressione su nessuno.
         a.deadline_at,
         a.deadline_days,
         a.deadline_basis,
         a.follow_up_of_action_id,
         date_trunc('hour', a.created_at) as created_at
    from public.actions a
    join public.clusters c on c.id = a.cluster_id
   where a.is_synthetic = false
     and c.is_synthetic = false
     -- Soglia di privacy, che qui mancava da 0002. Il titolo di un atto
     -- descrive il problema e il luogo («Accesso civico — spaccio in piazza X,
     -- Ballarò») e `recipient` dice a chi è stato mandato: su un gruppo da un
     -- cittadino è attribuibile a una persona sola. In pratica cambia poco —
     -- gli atti nascono quando il gruppo ha già superato la soglia di azione,
     -- che è più alta — ma chiude il percorso della generazione a richiesta.
     -- È una modifica di COMPORTAMENTO su una vista già in uso dalle pagine:
     -- va comunicata a chi lavora sul frontend, non scoperta da un elenco che
     -- si accorcia.
     and c.citizens_count >= public.config_int('min_public_citizens');

-- `public_cluster_reports` ricreata con il filtro sulla moderazione: parte
-- dalla definizione di 0005, che è l'ultima valida, e aggiunge un AND.
drop view if exists public.public_cluster_reports;

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
     and r.moderation_flagged = false
     and c.is_synthetic = false
     and c.citizens_count >= public.config_int('min_public_citizens');

comment on view public.public_cluster_reports is
  'Le segnalazioni di un gruppo pubblico, in forma anonima. Filtra sia lo stato '
  'sia `moderation_flagged`: i due dicono la stessa cosa da due lati, e '
  'fermarsi al primo lascerebbe in pagina il testo segnalato dal classificatore '
  'e non ancora deciso da una persona.';

-- `public_city_stats` ricreata: gli atti inviati restano contati anche dopo la
-- risposta. Il resto è identico a 0005.
drop view if exists public.public_city_stats;

create view public.public_city_stats as
  select c.city,
         count(distinct c.id)                                          as clusters_count,
         sum(c.reports_count)                                          as reports_count,
         sum(c.citizens_count)                                         as citizens_count,
         count(distinct a.id) filter (
           where a.status in ('inviata', 'risposta_ricevuta')
         )                                                             as actions_sent,
         count(distinct a.id) filter (where a.response_received_at is not null) as responses_received
    from public.clusters c
    left join public.actions a on a.cluster_id = c.id and a.is_synthetic = false
   where c.is_synthetic = false
     and c.citizens_count >= public.config_int('min_public_citizens')
   group by c.city;

comment on view public.public_city_stats is
  'Statistiche per comune. `actions_sent` conta ''inviata'' E '
  '''risposta_ricevuta'': un atto inviato resta inviato anche dopo che la PA ha '
  'risposto, altrimenti il contatore degli invii scenderebbe proprio quando le '
  'cose vanno bene. Allineata a public_platform_stats e a '
  'public_city_responsiveness.';

grant select on public.public_clusters,
                public.public_actions,
                public.public_cluster_reports,
                public.public_city_stats
  to anon, authenticated;

comment on view public.public_actions is
  'Atti visibili al pubblico. Il corpo (`body_markdown`) è esposto SOLO dopo '
  'la revisione umana: una bozza generata da un modello non va online prima '
  'che qualcuno se ne sia assunto la responsabilità (0008). Espone anche il '
  'termine di legge e la sua fonte normativa: un termine pubblico è una '
  'pressione, un termine privato è un promemoria.';

-- ---------------------------------------------------------------------------
-- Nota sul percorso che resta scoperto e che NON si chiude qui.
--
-- `public_actions` espone `actions.response_text` dalla prima migrazione. Se
-- qualcuno copiasse `action_responses.raw_text` in quella colonna, il testo
-- integrale di una risposta della PA — protocolli, nomi di funzionari,
-- eventuali dati del richiedente — finirebbe online senza passare da alcuna
-- anonimizzazione. Nessun codice lo fa oggi, il trigger della §6 valorizza solo
-- `response_received_at`, e da questa migrazione `response_text` non è più
-- nemmeno scrivibile dal pannello (vedi i grant di colonna nella §10).
-- Restringerlo anche in lettura è una modifica di comportamento su una vista
-- già in uso dalle pagine: va fatta con una migrazione propria, non nascosta in
-- fondo a questa.
-- ---------------------------------------------------------------------------


-- ============================================================================
-- 14. ANONIMIZZAZIONE A DUE LIVELLI (PLAN2 §5.1) — le colonne che la rendono
--     verificabile
--
-- Oggi `anon_text` esce da `triageReport()` in un'unica chiamata, insieme a
-- categoria, urgenza e città: un modello solo, un prompt solo, nessuna rete. Da
-- lì va in `public_cluster_reports` — pagina pubblica e indicizzabile — e dentro
-- gli atti via `generateDossier()`. Un LLM sbaglia: un civico, un cognome o il
-- nome di una scuola che sopravvivono a quella passata sono online.
--
-- Il secondo passaggio e la regola deterministica (regex su civici, targhe,
-- codici fiscali, telefoni, email) sono lavoro applicativo e spettano a
-- voce-ai-pipeline. Qui si aggiunge ciò che senza database non esiste: la
-- possibilità di SAPERE su quali segnalazioni la rete di sicurezza è passata
-- davvero. Senza queste due colonne, «abbiamo l'anonimizzazione doppia» è una
-- frase; con queste due colonne è una query — la stessa scelta già fatta per la
-- moderazione, che ha categorie, punteggio e data invece di un sì/no.
-- ============================================================================

alter table public.reports
  add column if not exists anon_reviewed_at timestamptz,
  add column if not exists anon_redactions  jsonb;

comment on column public.reports.anon_reviewed_at is
  'Quando il secondo passaggio di anonimizzazione ha riletto `anon_text`. Null '
  'significa «una passata sola»: quel testo è uscito dallo stesso modello che '
  'faceva anche il triage, senza rete. Serve a poter rispondere alla domanda '
  '«su quali segnalazioni pubbliche il controllo è davvero passato?», che senza '
  'questa colonna non ha risposta.';

comment on column public.reports.anon_redactions is
  'Che cosa ha tolto il secondo passaggio e con quale regola, es. '
  '[{"regola":"civico","conteggio":2}]. Mai il valore rimosso: registrare che '
  'si è oscurato «via Ferrari 3» scrivendo «via Ferrari 3» in un''altra colonna '
  'non è anonimizzare, è spostare. Serve a tarare le regole deterministiche '
  'sui casi veri.';

comment on column public.reports.raw_media_urls is
  'DEPRECATA. I media stanno in public.report_media, dentro un bucket privato, '
  'e come percorso e non come URL. Non scrivere qui: due sedi per lo stesso '
  'dato significano che la cancellazione ne ripulisce una sola e che chi '
  'implementa i vocali sceglie la più comoda. Resta in tabella solo perché '
  'delete_citizen_account() la azzera da 0002 e toglierla è una migrazione a sé.';


-- ============================================================================
-- 15. DIRITTO ALL'OBLIO, ESTESO AI MEDIA
--
-- `delete_citizen_account()` è di 0002, scritta quando `report_media` non
-- esisteva. Azzera raw_text, clean_text, location e gli embedding — e non
-- conosce la tabella che questa stessa migrazione introduce. Il risultato,
-- verificato: dopo l'esercizio dell'art. 17 il cittadino sparisce, il testo è
-- sostituito dal segnaposto, e la trascrizione del vocale resta lì integra,
-- «sono Mario Rossi, abito in via …, ho l'asma», agganciata a un report che il
-- codice considera anonimizzato. La §4 di questa migrazione scrive che un
-- vocale è un dato biometrico ai sensi dell'art. 9 GDPR: introdurre quella
-- tabella senza estendere la cancellazione significa che il diritto all'oblio
-- lascia in piedi proprio il dato più identificante — e senza più il legame al
-- cittadino, quindi nessuno potrà più collegarlo a una richiesta futura.
--
-- DUE COSE CHE IL SQL DA SOLO NON PUÒ FARE, e per cui serve la coda.
-- Un DELETE su una riga di database non cancella l'oggetto nel bucket: Postgres
-- non parla con lo storage. Il file resterebbe orfano per sempre. La coda
-- registra il percorso e un job con service role la svuota chiamando
-- storage.remove(). Finché quel job non esiste, la coda è comunque il posto
-- dove sta scritto cosa deve sparire — un debito visibile invece di un file
-- dimenticato.
--
-- La seconda: la FK `reports.citizen_id` è `on delete set null`, non cascade.
-- Il commento di 0002 afferma il contrario («se non c'erano atti inviati, i
-- suoi report cadono in cascata») e descrive un comportamento che la FK non ha:
-- nel ramo senza atti inviati i report restavano in tabella con il raw_text
-- integro e il solo legame reciso. Cioè la cancellazione più semplice — quella
-- di chi non è mai finito in un atto protocollato — era la meno completa. Qui
-- si esegue davvero quello che il commento prometteva.
-- ============================================================================

create table if not exists public.storage_deletions (
  id           uuid primary key default gen_random_uuid(),
  bucket       text not null,
  path         text not null,
  reason       text not null default 'cancellazione_account',
  requested_at timestamptz not null default now(),
  deleted_at   timestamptz,
  attempts     int not null default 0,
  last_error   text,

  -- Idempotenza: la stessa cancellazione richiesta due volte è una riga sola.
  unique (bucket, path)
);

create index if not exists storage_deletions_da_svuotare_idx
  on public.storage_deletions (requested_at)
  where deleted_at is null;

alter table public.storage_deletions enable row level security;
revoke all on table public.storage_deletions from anon, authenticated;

-- NESSUNA policy, intenzionalmente: RLS attiva senza policy significa tabella
-- invisibile a chiunque non sia service role. L'elenco dei file da cancellare è
-- l'elenco di chi se n'è andato.

comment on table public.storage_deletions is
  'Coda dei file da rimuovere dai bucket. Esiste perché cancellare una riga di '
  'database non cancella l''oggetto nello storage, e un vocale orfano in un '
  'bucket è una persona identificabile che nessuno sa più di avere. La svuota '
  'un job con service role chiamando storage.remove(); finché non esiste, qui '
  'c''è scritto nero su bianco cosa deve ancora sparire.';

comment on column public.storage_deletions.deleted_at is
  'Valorizzata dal job dopo la rimozione effettiva dal bucket. Una riga con '
  'deleted_at null e requested_at di due settimane fa è un obbligo non '
  'adempiuto, non un dettaglio operativo.';

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

  -- 1. I MEDIA, PRIMA DI TUTTO E IN ENTRAMBI I RAMI.
  -- I percorsi vanno in coda prima che le righe spariscano: dopo il delete non
  -- esiste più nessun posto da cui ricavarli, e il file resterebbe nel bucket
  -- senza che nessuno sappia più a cosa apparteneva.
  insert into public.storage_deletions (bucket, path, reason)
  select 'segnalazioni-media', m.storage_path, 'cancellazione_account'
    from public.report_media m
   where m.report_id in (
           select r.id from public.reports r where r.citizen_id = target
         )
  on conflict (bucket, path) do nothing;

  delete from public.report_media
   where report_id in (
           select r.id from public.reports r where r.citizen_id = target
         );

  if has_submitted_actions then
    -- Il contributo resta nei gruppi in forma anonima; l'identità sparisce.
    -- Un atto già protocollato è un documento i cui fatti non si riscrivono.
    update public.reports
       set raw_text       = '[segnalazione rimossa su richiesta del cittadino]',
           clean_text     = null,
           location       = null,
           location_hint  = null,
           raw_media_urls = '{}'
     where citizen_id = target;

    delete from public.report_embeddings
     where report_id in (select id from public.reports where citizen_id = target);
  end if;

  -- Le firme si cancellano sempre: una firma è un atto di volontà revocabile.
  delete from public.signatures where citizen_id = target;

  if has_submitted_actions then
    -- Si recide il legame e si lascia il contributo anonimo dentro i gruppi.
    update public.reports set citizen_id = null where citizen_id = target;
  else
    -- Nessun atto protocollato: niente da preservare. Le segnalazioni si
    -- cancellano davvero — la FK è `on delete set null` e da sola le
    -- lascerebbe in tabella, raw_text compreso. Gli embedding e le eventuali
    -- notifiche cadono in cascata.
    delete from public.reports where citizen_id = target;
  end if;

  delete from public.citizens where id = target;
end;
$$;

-- L'ACL sopravvive a create or replace, ma si riafferma: questa funzione
-- accetta un uuid arbitrario e, esposta, cancellerebbe l'account di chiunque.
revoke all on function public.delete_citizen_account(uuid) from public, anon, authenticated;
grant execute on function public.delete_citizen_account(uuid) to service_role;

comment on function public.delete_citizen_account is
  'Diritto all''oblio. Cancella sempre media e firme, mette i file in coda per '
  'la rimozione dal bucket, e poi si comporta in due modi: se il contributo è '
  'già confluito in un atto INVIATO lo anonimizza e recide il legame — un atto '
  'protocollato non si riscrive — altrimenti cancella le segnalazioni per '
  'davvero. Il vocale è la parte meno cancellabile e la più identificante: è '
  'la prima che se ne va.';


-- ============================================================================
-- 16. CHIUSURA DELLE LETTURE DIRETTE SULLE TABELLE
--
-- Due policy di 0003 concedevano ad `anon` la SELECT sull'INTERA RIGA di
-- `actions` e `clusters`. La chiave anon è pubblica per costruzione — finisce
-- nel bundle del browser — quindi «policy per anon» significa «leggibile da
-- chiunque, senza sessione», e la RLS non sa filtrare colonne.
--
--   `action_public_read using (is_synthetic = false)`
--     → GET /rest/v1/actions?select=body_markdown&status=eq.bozza restituisce
--       il testo generato dal modello PRIMA di ogni controllo umano, insieme a
--       pdf_url, docx_url e response_text. La 0008 nasce da un incidente
--       concreto (un esposto in bozza conteneva la condizione clinica di un
--       minore che non ha mai scritto a VOCE) e ha corretto SOLO la vista: la
--       policy sulla tabella è rimasta com'era. La promessa «le bozze non si
--       pubblicano» era falsa a livello di database, e la §13 di questa
--       migrazione l'avrebbe lasciata falsa.
--
--   `cluster_public_read using (is_synthetic = false and citizens_count >= …)`
--     → GET /rest/v1/clusters?select=centroid restituisce la geometria a
--       PRECISIONE PIENA: blur_point() vive solo dentro la vista. Su un gruppo
--       da tre segnalazioni in una via corta il centroide è la media di tre
--       posizioni vere, cioè un portone. È la regola «~300 m in qualunque
--       output pubblico» violata sul percorso più banale. E questa migrazione
--       peggiorava il quadro aggiungendo a `clusters` colonne che ha
--       deliberatamente ESCLUSO dalla vista pubblica: `review_reason` in chiaro
--       («dodici account creati lo stesso giorno») e `reviewed_by` col nome del
--       revisore — cioè il sospetto di brigading su un gruppo, pubblicato.
--
-- Le viste `public_*` NON sono security_invoker: girano con i privilegi del
-- proprietario, quindi togliere policy e privilegi di tabella non le rompe. Le
-- pagine leggono già solo da lì (apps/web/lib/queries/public.ts), e tutte le
-- scritture del server passano da service role, che la RLS non tocca.
--
-- Il commento in testa a `action_public_read` diceva che la policy serviva come
-- barriera «nel caso qualcuno interroghi la tabella direttamente via
-- PostgREST». L'esposizione era quindi nota: era la barriera a non filtrare ciò
-- che doveva.
-- ============================================================================

drop policy if exists action_public_read  on public.actions;
drop policy if exists cluster_public_read on public.clusters;

-- Difesa in profondità: senza policy la RLS già restituirebbe zero righe, ma
-- togliere anche il privilegio di tabella fa rispondere a PostgREST un
-- «permission denied» sulla relazione invece di un elenco vuoto — che è la
-- differenza fra «non puoi» e «non c'è niente», e la prima è la verità.
revoke all on table public.actions          from anon;
revoke all on table public.clusters         from anon;
revoke all on table public.reports          from anon;
revoke all on table public.citizens         from anon;
revoke all on table public.signatures       from anon;
revoke all on table public.report_embeddings from anon;

-- `pa_endpoints` resta leggibile: sapere a chi è stato mandato un atto fa parte
-- della trasparenza, e in quella tabella non c'è nessun cittadino.

-- Le due funzioni di trigger di 0002 sono rimaste eseguibili da anon e
-- authenticated: la regola scritta in 0003 — «ogni funzione nasce con EXECUTE a
-- PUBLIC e va SEMPRE revocata» — era stata applicata a tutte le altre. Chiamarle
-- via RPC fallisce comunque («trigger functions can only be called as trigger
-- triggers»), ma è superficie esposta senza motivo, ed è il tipo di residuo che
-- la nota in 0003 dice essere già costato una falla una volta. I trigger
-- continuano a scattare: il privilegio si verifica alla CREATE TRIGGER.
revoke all on function public.on_reports_change()    from public, anon, authenticated;
revoke all on function public.on_signatures_change() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- COME SI VERIFICA, una riga per promessa. Da eseguire dopo `supabase db reset`
-- su un database con qualche riga dentro; ciascuna deve dare il risultato
-- indicato, e se non lo dà la promessa corrispondente è falsa.
--
--   set role anon;
--     select * from public.actions;                 → permission denied
--     select * from public.clusters;                → permission denied
--     select * from public.reports;                 → permission denied
--     select * from public.report_media;            → permission denied
--     select * from public.notifications;           → permission denied
--     select * from public.action_responses;        → permission denied
--     select * from public.admin_clusters_overview; → permission denied
--     select * from public.admin_actions_queue;     → permission denied
--     select body_markdown from public.public_actions where revisionato = false;
--                                                   → tutte le righe a null
--     select public.search_public_clusters(...);    → nessuna colonna numerica
--   reset role;
--
--   -- come utente autenticato NON amministratore (jwt.claims.sub = suo uid):
--     select count(*) from public.admin_clusters_overview;  → 0
--     select count(*) from public.admin_actions_queue;      → 0
--     select count(*) from public.notifications;            → solo le sue
--     select public.report_is_under_moderation('<id altrui>'); → false
--
--   -- come utente A, sui dati di B:
--     select count(*) from public.reports    where citizen_id = '<B>';  → 0
--     select count(*) from public.signatures where citizen_id = '<B>';  → 0
--
--   -- moderazione e gruppi:
--     update reports set moderation_flagged = true where id = '<r>';
--       → cluster_id null, previous_cluster_id valorizzato, contatori scesi
--     insert into actions (...) su un cluster con review_flag
--       → eccezione «gruppo … in revisione»
--     update actions set reviewed_by = '  ' where id = '<a>';
--       → reviewed_by torna null, body_markdown resta fuori da public_actions
--
--   -- diritto all'oblio, con un vocale allegato:
--     select public.delete_citizen_account('<c>');
--     select count(*) from public.report_media where report_id = '<r>';   → 0
--     select count(*) from public.storage_deletions where deleted_at is null;
--                                                                          → ≥ 1
--
-- Finché queste asserzioni non girano in automatico — pgTAP in
-- `supabase/tests/`, eseguito in CI — restano istruzioni per una persona, e
-- una garanzia che nessun test può far fallire è una dichiarazione.
-- ---------------------------------------------------------------------------
