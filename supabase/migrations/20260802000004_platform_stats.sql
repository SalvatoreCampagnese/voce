-- ============================================================================
-- Statistiche di piattaforma
--
-- Perché questa vista esiste.
-- I contatori della home leggevano `public_city_stats`, che deriva TUTTO dai
-- gruppi ed è filtrata a `citizens_count >= 3`. Finché non esiste un gruppo
-- pubblico, quella vista non restituisce righe e ogni contatore vale zero:
-- la home diceva «0 cittadini che hanno segnalato» mentre i cittadini avevano
-- segnalato davvero. Su un progetto che promette trasparenza, un contatore che
-- nega la partecipazione reale è il tipo di errore peggiore — e scoraggia
-- proprio le persone che si sono appena fidate.
--
-- Qui i totali si contano dalle segnalazioni, senza passare dai gruppi.
--
-- Privacy: sono scalari aggregati su tutta la piattaforma. Un numero non dice
-- CHI ha segnalato né COSA: la soglia dei 3 cittadini continua a proteggere
-- l'unica cosa che identifica davvero, cioè il contenuto di un gruppo e la sua
-- posizione. Le segnalazioni sintetiche restano escluse ovunque.
-- ============================================================================

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

    -- Solo i gruppi che hanno superato la soglia di pubblicazione: qui il
    -- numero deve coincidere con quello che una persona può davvero aprire.
    (
      select count(*)::int
        from public.clusters c
       where c.is_synthetic = false
         and c.citizens_count >= 3
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

grant select on public.public_platform_stats to anon, authenticated;

comment on view public.public_platform_stats is
  'Totali di piattaforma per i contatori pubblici. Contano le segnalazioni '
  'reali, non i gruppi: un cittadino che ha scritto deve vedersi contato anche '
  'prima che il suo problema diventi un gruppo.';
