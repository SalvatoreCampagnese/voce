# Mappa ID Context7 — stack VOCE

ID verificati contro l'indice Context7 (agosto 2026). Usali direttamente come
`libraryId` in `mcp__context7__query-docs`, senza passare da `resolve-library-id`.

La colonna "argomenti" elenca i temi su cui quella libreria serve: trasformali in una
`query` in forma di domanda su **un solo concetto** (es. «come si scrive una policy
RLS che consente la lettura pubblica di una tabella»), non copiarli come parole chiave.
Puoi appendere una versione all'ID quando serve: `/vercel/next.js/v15.0.0`.

## Framework & runtime

| Cosa | ID Context7 | Argomenti |
|---|---|---|
| Next.js (repo, canonico) | `/vercel/next.js` | `route handlers`, `middleware`, `server actions`, `ISR revalidate`, `metadata` |
| Next.js (docs sito) | `/websites/nextjs` | `app router layouts`, `dynamic params`, `edge runtime` |
| Vercel (piattaforma) | `/websites/vercel` | `cron jobs`, `environment variables`, `edge functions`, `geolocation` |
| Deno (Supabase Edge Functions) | `/denoland/deno` | `http server`, `permissions`, `npm specifiers` |

## Dati

| Cosa | ID Context7 | Argomenti |
|---|---|---|
| Supabase (piattaforma) | `/supabase/supabase` | `row level security`, `edge functions`, `realtime`, `storage`, `auth otp`, `pgvector` |
| supabase-js v2 | `/supabase/supabase-js` | `upsert onConflict`, `rpc`, `realtime channel`, `select single` |
| @supabase/ssr (client SSR) | `/supabase/ssr` | `createServerClient nextjs`, `cookies getAll setAll`, `middleware` |
| Supabase Auth (GoTrue) | `/supabase/auth` | `signInWithOtp`, `verifyOtp`, `phone auth` |
| pgvector | `/pgvector/pgvector` | `hnsw index`, `ivfflat lists`, `cosine distance operator` |
| PostGIS | `/websites/postgis_net` | `geography point 4326`, `ST_DWithin`, `gist index` |

## AI

| Cosa | ID Context7 | Argomenti |
|---|---|---|
| OpenAI API (docs) | `/websites/developers_openai_api` | `structured outputs`, `embeddings`, `moderation`, `batch api` |
| scikit-learn | `/scikit-learn/scikit-learn` | `DBSCAN`, `clustering metrics` |
| HDBSCAN | `/scikit-learn-contrib/hdbscan` | `min_cluster_size`, `cosine metric` |

> Per l'SDK Node di OpenAI non esiste un mirror affidabile ad alto trust in Context7:
> usa `/websites/developers_openai_api` per il contratto API e, se serve la firma TS
> esatta, leggi `node_modules/openai/index.d.ts` nel repo.

## Canali di ingestione

| Cosa | ID Context7 | Argomenti |
|---|---|---|
| Telegram Bot API | `/websites/core_telegram_bots_api` | `setWebhook`, `sendMessage`, `Update object`, `secret token` |
| Twilio (docs) | `/websites/twilio` | `whatsapp sandbox`, `webhook signature validation`, `messaging response` |
| twilio-node SDK | `/twilio/twilio-node` | `twiml MessagingResponse`, `validateRequest` |

## UI & design system

| Cosa | ID Context7 | Argomenti |
|---|---|---|
| Tailwind CSS | `/tailwindlabs/tailwindcss.com` | `theme configuration`, `v4 upgrade`, `custom colors`, `font family` |
| shadcn/ui | `/shadcn-ui/ui` | `components.json`, `button variants`, `form`, `dialog` |
| Bootstrap Italia | `/italia/bootstrap-italia` | `variables scss colors`, `typography scale`, `header`, `accessibility` |
| Design React Kit (AGID) | `/italia/design-react-kit` | `Header`, `Breadcrumb`, `Callout`, `Chip` |
| react-leaflet | `/websites/react-leaflet_js` | `MapContainer`, `TileLayer`, `Circle`, `ssr` |
| Leaflet | `/leaflet/leaflet` | `Circle radius`, `tile layer attribution` |
| react-pdf (renderer) | `/diegomura/react-pdf` | `Document Page StyleSheet`, `renderToBuffer`, `font register` |
| Zod | `/colinhacks/zod` | `safeParse`, `z.object`, `error flatten` |

## Test & qualità

| Cosa | ID Context7 | Argomenti |
|---|---|---|
| Playwright | `/microsoft/playwright` | `test fixtures`, `accessibility snapshot`, `route interception` |

## Fonti NON coperte da Context7 (usa WebFetch)

Il dominio civico/normativo italiano non è indicizzato: vai alla fonte.

- Linee guida design servizi PA — <https://docs.italia.it/italia/design/lg-design-servizi-web/>
- Designers Italia (voice & tone, pattern) — <https://designers.italia.it>
- Bootstrap Italia (demo componenti) — <https://italia.github.io/bootstrap-italia>
- Normativa (L. 241/1990, D.Lgs. 33/2013, D.Lgs. 82/2005 CAD) — <https://www.normattiva.it>
- GDPR / linee guida Garante Privacy — <https://www.garanteprivacy.it>
- WCAG 2.1 AA — <https://www.w3.org/WAI/WCAG21/quickref/>
