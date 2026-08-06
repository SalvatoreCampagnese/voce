-- ============================================================================
-- Risposta in sospeso alla domanda di dettaglio
--
-- Il bot chiede una cosa sola e precisa («di che tipo di guasto si tratta?»,
-- «da quanto tempo va avanti?») e la persona risponde. Fino a qui la risposta
-- veniva letta come una segnalazione NUOVA: il cittadino si ritrovava due righe
-- dimezzate al posto di una completa, e nessuna delle due entrava in un gruppo.
-- Peggio: nel messaggio precedente gli avevamo appena scritto «riscrivimela
-- pure qui, la sostituisco a quella di prima», cioè una promessa che il codice
-- non manteneva.
--
-- Questa colonna è la memoria di quella domanda, esattamente come
-- `pending_city_report_id` (0006) lo è per il comune: quando è valorizzata, il
-- messaggio successivo va prima confrontato con la domanda che abbiamo fatto.
-- Se è la risposta, integra la segnalazione di prima e la fa ri-smistare; se è
-- tutt'altro, la colonna si svuota e il messaggio prosegue come segnalazione
-- nuova — chi ha ignorato la domanda e ha raccontato un altro problema non deve
-- perderlo.
--
-- Le due attese non convivono: la domanda sul comune ha la precedenza (due
-- domande insieme non ricevono risposta), quindi il codice valorizza l'una
-- oppure l'altra, mai entrambe.
--
-- `on delete set null` e non `cascade`: se la segnalazione sparisce, il
-- cittadino resta.
-- ============================================================================

alter table public.citizens
  add column if not exists pending_detail_report_id uuid
    references public.reports(id) on delete set null;

comment on column public.citizens.pending_detail_report_id is
  'Segnalazione per cui abbiamo fatto una domanda di dettaglio '
  '(reports.follow_up_question) e stiamo aspettando la risposta. Quando è '
  'valorizzata, il messaggio successivo va letto come integrazione di quella '
  'segnalazione e non come una nuova. Si svuota appena la risposta arriva, o '
  'appena si capisce che il cittadino stava parlando d''altro.';

-- Indice parziale: le righe in attesa sono poche e sono le uniche che
-- interroghiamo per chiave. Stessa forma di `citizens_pending_city_idx`.
create index if not exists citizens_pending_detail_idx
  on public.citizens (pending_detail_report_id)
  where pending_detail_report_id is not null;
