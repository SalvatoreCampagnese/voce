-- ============================================================================
-- Le bozze non si pubblicano
--
-- Rilievo emerso dalla revisione avversariale dei modelli di atto, e non è un
-- difetto dei modelli: è di questa vista.
--
-- `public_actions` esponeva `body_markdown` di OGNI atto non sintetico, incluse
-- le bozze appena generate. Significa che il testo scritto da un modello
-- linguistico finiva su una pagina web pubblica e indicizzabile **prima** che
-- un essere umano lo avesse letto. Tutto l'impianto — lo stato `bozza`, il
-- vincolo `actions_review_before_send` — serviva a impedire l'INVIO, e nessuno
-- si era accorto che la PUBBLICAZIONE avveniva comunque.
--
-- Il danno concreto misurato sull'esempio: un esposto conteneva la condizione
-- clinica di un minore, con data e struttura, riferita a una persona che non
-- ha mai scritto a VOCE e non poteva acconsentire. Online, prima di ogni
-- controllo.
--
-- Da qui in avanti il corpo dell'atto è pubblico solo dopo la revisione umana.
-- Titolo, tipo, stato, destinatario e conteggio firme restano visibili: la
-- trasparenza sul FATTO che un atto esiste non richiede di pubblicarne il testo
-- non verificato.
-- ============================================================================

drop view if exists public.public_actions;

create view public.public_actions as
  select a.id,
         a.cluster_id,
         a.kind,
         a.status,
         a.title,
         -- Il testo compare solo quando una persona lo ha firmato con nome e
         -- cognome in `reviewed_by`. Prima di allora è null, e la pagina
         -- spiega perché.
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
         date_trunc('hour', a.created_at) as created_at
    from public.actions a
    join public.clusters c on c.id = a.cluster_id
   where a.is_synthetic = false
     and c.is_synthetic = false;

grant select on public.public_actions to anon, authenticated;

comment on view public.public_actions is
  'Atti visibili al pubblico. Il corpo (`body_markdown`) è esposto SOLO dopo la '
  'revisione umana: una bozza generata da un modello non va online prima che '
  'qualcuno se ne sia assunto la responsabilità.';
