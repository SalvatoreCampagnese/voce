-- ============================================================================
-- L'esito della moderazione è un avviso, non un silenzio
--
-- PERCHÉ QUESTA MIGRAZIONE CONTIENE DUE SOLE RIGHE DI ALTER.
--
-- Postgres permette `alter type ... add value` dentro una transazione ma
-- VIETA di usare quel valore nella stessa transazione: qualunque riferimento
-- successivo fallisce con «unsafe use of new value of enum type
-- notification_kind». La CLI di Supabase esegue ogni file di migrazione dentro
-- una transazione, quindi un file che aggiunge il valore e poi lo usa — in un
-- insert, in un default, dentro il corpo di una funzione con un letterale
-- tipizzato — semplicemente non gira. È già costato una migrazione
-- (20260806000009_valori_enum.sql, stessa forma, stesso motivo): qui si fa
-- come lì. Chi dovrà scrivere SQL che usa questi due valori lo metta in un
-- file successivo.
--
-- PERCHÉ SERVONO QUESTI DUE VALORI.
--
-- Il bot dice a chi finisce in quarantena: «la leggerà una persona». La persona
-- legge davvero — `app/admin/segnalazioni/azioni.ts` — e decide fra riammettere
-- e confermare. Lì finiva tutto: nessuna riga in `notifications`, nessun valore
-- nell'enum per rappresentare l'evento, nessun messaggio al cittadino. Chi si
-- è visto fermare la segnalazione restava in silenzio per sempre, dopo che gli
-- avevamo promesso una lettura umana. Una promessa mantenuta che nessuno viene
-- a sapere vale quanto una promessa rotta.
--
--   'moderazione_riammessa'   — la revisione ha sciolto il dubbio: la
--                               segnalazione torna a `status='nuovo'`, il cron
--                               di recupero la ripesca e il triage la rimette
--                               in circolo. Il cittadino va avvisato perché
--                               l'ultima cosa che sa è «per ora resta ferma».
--   'moderazione_confermata'  — la revisione ha confermato la quarantena: la
--                               segnalazione resta fuori dai gruppi e dagli
--                               atti. Va detto lo stesso, e senza accusare:
--                               una porta che si chiude in silenzio è peggio
--                               di una porta che si chiude.
--
-- Non c'è un terzo valore per «cancellata» perché la quarantena non cancella:
-- mette da parte, e un falso positivo su dialetto o turpiloquio deve poter
-- tornare indietro.
--
-- `if not exists` rende la migrazione ri-eseguibile senza errore.
-- ============================================================================

alter type public.notification_kind add value if not exists 'moderazione_riammessa';
alter type public.notification_kind add value if not exists 'moderazione_confermata';

-- Il commento sul TIPO nomina i valori solo dentro una stringa: non li usa come
-- valori dell'enum, quindi è lecito nella stessa transazione.
comment on type public.notification_kind is
  'Eventi per cui VOCE scrive a un cittadino. Ai cinque eventi di gruppo e di '
  'scadenza si aggiungono i due esiti della moderazione umana '
  '(moderazione_riammessa, moderazione_confermata): chi finisce in quarantena '
  'ha ricevuto la promessa che una persona lo avrebbe letto, e deve sapere '
  'come è andata a finire. Nessuno dei due riferisce il motivo del fermo: '
  'l''avviso dice l''esito, non fa la lezione.';
