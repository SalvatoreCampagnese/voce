---
name: context7-docs
description: Fetch current, version-accurate library documentation via Context7 before writing or reviewing code that touches the VOCE stack (Next.js App Router, Supabase/pgvector/PostGIS, Tailwind, shadcn/ui, OpenAI SDK, Twilio, Telegram Bot API, Deno Edge Functions, Leaflet, Zod, Vercel). Use it whenever an API surface, config key, import path, or migration detail must be exact — never write stack code from memory.
---

# Context7 — documentazione aggiornata prima di scrivere codice

VOCE ha 14 giorni di tempo e uno stack che si muove in fretta (Next.js App Router,
Supabase SSR, Tailwind v3→v4, OpenAI SDK). Ogni ora persa a debuggare un'API
inventata a memoria è un'ora tolta al pilot. Questa skill impone il ciclo:
**risolvi → leggi i docs → scrivi**.

## Quando è obbligatorio usarla

Prima di:

- creare o modificare un **Route Handler**, `middleware.ts`, `layout.tsx`, o qualunque
  file sotto `apps/web/app/` (le firme di Next.js cambiano tra major);
- scrivere codice **Supabase** (client SSR/route/service, RLS, RPC, Realtime, Storage,
  Edge Functions Deno);
- scrivere **SQL** con `pgvector` (indici IVFFlat/HNSW, operatori `<=>`) o **PostGIS**;
- chiamare **OpenAI** (chat completions, structured outputs, embeddings, moderation);
- integrare **Twilio** (webhook, TwiML, validazione firma) o **Telegram Bot API**;
- toccare `tailwind.config.ts`, token del design system, o componenti **shadcn/ui**;
- configurare **Vercel** (`vercel.json`, cron, runtime edge/nodejs, `maxDuration`).

Se stai per scrivere una riga di codice che usa una libreria e non hai letto i suoi
docs **in questa sessione**, fermati e fai la lookup. Costa 20 secondi.

## Ciclo operativo

1. **Risolvi l'ID.** Usa la mappa in `references/voce-library-map.md`: contiene gli ID
   Context7 già verificati per tutto lo stack VOCE. Usali direttamente — non serve
   `resolve-library-id` per le librerie già mappate.
   Per una libreria *non* in mappa: `mcp__context7__resolve-library-id`
   (`libraryName` con il nome ufficiale — «Next.js», non «nextjs» — e `query` con ciò
   che devi ottenere), poi scegli il risultato con reputazione alta e più snippet.

2. **Interroga i docs.** `mcp__context7__query-docs` con:
   - `libraryId`: l'ID esatto (es. `/supabase/supabase`, opzionalmente con versione
     `/vercel/next.js/v15.0.0`);
   - `query`: **una domanda concreta su un solo concetto**. È ciò che separa una
     risposta utile dal rumore.
     Buona: `"come creare il client Supabase server-side in un Route Handler Next.js"`.
     Cattiva perché vaga: `"auth"`. Cattiva perché troppo ampia:
     `"routing, auth e caching in Next.js"` → tre chiamate separate.
   - **Massimo 3 chiamate `query-docs` per domanda.** Se ne servono di più, la domanda
     va spezzata in più passi di lavoro.
   - Non mettere mai chiavi, credenziali o dati personali dentro `query`: viene
     inviata all'API di Context7.

3. **Scrivi il codice** citando nel commento la fonte solo quando l'API è
   controintuitiva (es. perché `runtime = 'nodejs'` è obbligatorio per l'SDK Twilio).

4. **Se i docs contraddicono `PLAN.md`, vincono i docs.** `PLAN.md` è stato scritto in
   anticipo e contiene almeno un pattern già deprecato (vedi sotto). Segnala la
   discrepanza all'utente in una riga, applica la versione corretta, e prosegui.

## Deprecazioni note già presenti in PLAN.md

Verifica questi punti con Context7 prima di copiare il codice del piano:

| In `PLAN.md` | Da verificare / sostituire |
|---|---|
| `@supabase/auth-helpers-nextjs` (`createMiddlewareClient`) | Pacchetto deprecato → `@supabase/ssr` (`createServerClient` + `getAll/setAll` cookies) |
| `params: { id: string }` nei Route Handler | Da Next.js 15 i `params` sono una `Promise` da `await` |
| `require()` dentro `tailwind.config.ts` | Tailwind v4 usa `@import "tailwindcss"` e `@theme` in CSS: verifica quale major stai installando |
| `response_format: { type: 'json_object' }` | Esistono ora gli Structured Outputs con JSON Schema: più affidabili per il triage |
| `create index ... ivfflat` senza dati | IVFFlat va creato **dopo** aver caricato righe; con pochi report usa HNSW o nessun indice |

## Regole di igiene

- **Non inventare mai** un nome di funzione, un'opzione di config o un parametro:
  se non l'hai visto nei docs, non esiste finché non lo verifichi.
- **Una lookup per dominio, non per riga**: raccogli le domande su Supabase e falle
  in una sola chiamata con topic ben scelto.
- **Non usare Context7 per il dominio civico italiano** (L. 241/1990, D.Lgs. 33/2013,
  linee guida AGID, criteri del quartiere pilota): lì servono `WebFetch`/`WebSearch`
  sulle fonti ufficiali (`docs.italia.it`, `normattiva.it`, `designers.italia.it`).
- Se Context7 non risponde o è rate-limited, **dillo esplicitamente** e ripiega su
  `WebFetch` della doc ufficiale — non ripiegare silenziosamente sulla memoria.

## Autenticazione (opzionale)

Il server è configurato keyless in `.mcp.json` (rate limit basso ma sufficiente).
Per alzare i limiti: crea una chiave su context7.com e aggiungi al server l'header
`"headers": { "CONTEXT7_API_KEY": "..." }`, oppure esporta `CONTEXT7_API_KEY`
e referenzialo come `"${CONTEXT7_API_KEY}"`.
