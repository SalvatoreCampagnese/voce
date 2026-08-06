-- ============================================================================
-- Nuovi tipi di atto: il sollecito e il riesame dell'accesso civico
--
-- PERCHÉ QUESTA MIGRAZIONE CONTIENE DUE SOLE RIGHE.
--
-- Postgres permette `alter type ... add value` dentro una transazione, ma
-- VIETA di usare quel valore nella stessa transazione: qualunque riferimento
-- successivo fallisce con «unsafe use of new value of enum type action_kind».
-- La CLI di Supabase esegue ogni file di migrazione dentro una transazione, e
-- la migrazione successiva (20260806000010_plan2.sql) usa entrambi i valori
-- dentro `public.action_follow_up_kind()`, la funzione che decide quale atto
-- viene dopo alla scadenza del termine di legge. Tenerli nello stesso file
-- significherebbe una migrazione che non gira: da qui la separazione.
--
-- PERCHÉ SERVONO QUESTI DUE VALORI.
--
-- Oggi un atto inviato e ignorato resta ignorato per sempre: nessuno conta i
-- giorni e nessuno prepara il passo successivo. PLAN2 §3.1 chiude questo buco,
-- e il passo successivo ha due forme diverse a seconda della norma violata:
--
--   'sollecito'                — il richiamo generico a un'amministrazione che
--                                non ha risposto entro il termine (L. 241/1990
--                                art. 2: il procedimento ha un termine, e il
--                                silenzio non lo sospende).
--   'riesame_accesso_civico'   — la richiesta di riesame al titolare del potere
--                                sostitutivo prevista dall'art. 5 c. 7 del
--                                D.Lgs. 33/2013, specifica dell'accesso civico
--                                generalizzato: non è un sollecito, è un
--                                rimedio con un destinatario diverso e un
--                                termine proprio (20 giorni).
--
-- Chiamarli entrambi «sollecito» farebbe scrivere l'atto sbagliato alla persona
-- sbagliata, che è il modo più rapido di far cestinare una richiesta legittima.
--
-- `if not exists` rende la migrazione ri-eseguibile senza errore.
-- ============================================================================

alter type public.action_kind add value if not exists 'sollecito';
alter type public.action_kind add value if not exists 'riesame_accesso_civico';

-- Il commento sul TIPO non usa i valori appena aggiunti (cita solo il loro
-- nome dentro una stringa), quindi è lecito nella stessa transazione.
comment on type public.action_kind is
  'Tipi di atto che VOCE prepara. I due valori di seguito nascono dallo '
  'scadenzario normativo (PLAN2 §3.1) e non dalla generazione iniziale del '
  'dossier: vengono creati quando un atto già inviato supera il termine di '
  'legge senza risposta. Nessuno dei due parte senza revisione umana: il '
  'vincolo actions_review_before_send vale identico per gli atti di seguito.';
