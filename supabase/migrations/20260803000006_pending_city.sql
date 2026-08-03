-- ============================================================================
-- Domanda in sospeso: «di che comune stiamo parlando?»
--
-- Il raggruppamento confronta categoria E zona: due segnalazioni di buche in
-- comuni diversi non sono lo stesso problema. Ma Telegram non ci dice da dove
-- scrive una persona, e finora le segnalazioni dai bot restavano senza comune —
-- quindi il filtro geografico non si applicava affatto.
--
-- Da qui in poi: l'estrazione prova a ricavare il luogo dal testo; se non c'è,
-- il bot lo chiede. Questa colonna ricorda a quale segnalazione si riferisce la
-- domanda, così la risposta successiva non viene scambiata per una nuova
-- segnalazione.
--
-- Si chiede UNA volta per cittadino: appena `citizens.city` è noto, le
-- segnalazioni successive lo ereditano senza disturbare più nessuno.
-- ============================================================================

alter table public.citizens
  add column pending_city_report_id uuid references public.reports(id) on delete set null;

comment on column public.citizens.pending_city_report_id is
  'Segnalazione per cui stiamo aspettando che il cittadino dica il comune. '
  'Quando è valorizzata, il messaggio successivo va letto come risposta alla '
  'domanda e non come nuova segnalazione.';

-- Indice parziale: le righe in attesa sono poche, e sono le uniche che
-- interroghiamo per chiave.
create index citizens_pending_city_idx
  on public.citizens (pending_city_report_id)
  where pending_city_report_id is not null;
