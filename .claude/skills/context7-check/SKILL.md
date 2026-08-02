---
name: context7-check
description: Audit existing VOCE code against current library documentation via Context7 to catch API drift — deprecated packages, changed function signatures, removed config keys, invalid SQL/index syntax. Use before a commit, after copying code from PLAN.md, when a build or runtime error smells like a version mismatch, or when the user asks to verify code is up to date.
---

# Context7 check — verifica del codice contro i docs reali

`PLAN.md` è un piano scritto a tavolino: contiene codice plausibile ma non compilato,
copiato da pattern di versioni precedenti. Questa skill serve a **non portare in
produzione un'API che non esiste più**.

## Quando eseguirla

- Subito dopo aver implementato un file partendo dagli snippet di `PLAN.md`.
- Prima di un commit che tocca `app/api/**`, `lib/supabase/**`, `middleware.ts`,
  `packages/db/migrations/**`, `tailwind.config.ts`, `vercel.json`.
- Quando un errore ha la forma «X is not a function», «Module not found»,
  «unknown option», «syntax error at or near» — è drift, non un bug di logica.

## Procedura

1. **Inventario delle dipendenze reali.** Leggi i `package.json` del monorepo e
   annota le versioni major installate. Il check si fa contro *quelle* versioni,
   non contro l'ultima release esistente.

2. **Estrai le superfici a rischio** dai file in scope: import, nomi di funzione,
   chiavi di config, firme dei Route Handler, sintassi SQL delle migration.

3. **Interroga Context7** con `mcp__context7__query-docs`: una `query` per concetto,
   formulata come domanda («la firma dei Route Handler dinamici in Next.js 15 riceve
   `params` come Promise?»), massimo 3 chiamate per verifica. ID pronti in
   `context7-docs/references/voce-library-map.md`:

   | Dominio | ID | Argomento della query |
   |---|---|---|
   | Client Supabase in Next.js | `/supabase/ssr` | `createServerClient nextjs cookies` |
   | RLS e policy | `/supabase/supabase` | `row level security policies` |
   | Route Handler / params | `/vercel/next.js` | `route handlers dynamic params` |
   | Indici vettoriali | `/pgvector/pgvector` | `hnsw ivfflat index creation` |
   | Webhook Twilio | `/twilio/twilio-node` | `validateRequest twiml` |
   | Webhook Telegram | `/websites/core_telegram_bots_api` | `setWebhook secret_token` |
   | Config Tailwind | `/tailwindlabs/tailwindcss.com` | `theme configuration v4` |
   | Output JSON LLM | `/websites/developers_openai_api` | `structured outputs json schema` |

4. **Riporta i finding** in tabella: `file:riga` · cosa usa il codice · cosa dicono i
   docs · severità (`rotto` / `deprecato` / `subottimale`) · fix in una riga.

5. **Applica i fix** solo se `rotto` o `deprecato`. Per `subottimale`, proponi e
   chiedi. Non riscrivere codice funzionante per gusto estetico.

## Checklist minima specifica di VOCE

Punti dove il piano è quasi certamente disallineato — controllali sempre:

- [ ] `@supabase/auth-helpers-nextjs` presente in qualunque file → migrare a `@supabase/ssr`.
- [ ] Route Handler con `{ params }` non awaited (Next.js ≥ 15).
- [ ] `runtime = 'edge'` su una route che importa l'SDK Twilio o `openai` con dipendenze Node.
- [ ] `create index ... using ivfflat` eseguito su tabella vuota (indice inutile: va creato dopo il seed, o usa HNSW).
- [ ] `reports.city` / `reports.neighborhood` usati in `match_similar_reports` ma **assenti dallo schema** di `reports` in `PLAN.md` §4 — la RPC non compila.
- [ ] `reports.cluster_id` referenzia `clusters(id)` ma `clusters` è creata **dopo** `reports` nella migration: ordine da invertire o vincolo da aggiungere con `alter table`.
- [ ] Policy RLS che confrontano `citizen_id = auth.uid()` mentre `citizens.id` non è
      collegato a `auth.users.id`: verificare il modello identità prima di fidarsi.
- [ ] `maxDuration` compatibile con il piano Vercel in uso.
- [ ] Cron Vercel senza verifica dell'header `Authorization: Bearer $CRON_SECRET`.

## Output

Chiudi sempre con una riga di verdetto: quanti finding `rotto`, quanti `deprecato`,
quali file restano da verificare perché non ancora scritti. Se non hai potuto
interrogare Context7 (rete/rate limit), dillo — un check non eseguito non è un check
passato.
