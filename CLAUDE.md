# VOCE — istruzioni di lavoro

Il piano completo del prodotto è in `PLAN.md`. Questo file dice **come** lavorare sul
repo: chi fa cosa e quale disciplina seguire.

## Regola numero uno: documentazione prima del codice

Prima di scrivere codice che tocca una libreria dello stack (Next.js, Supabase,
pgvector, Tailwind, shadcn/ui, OpenAI, Twilio, Telegram, Deno, Leaflet, Zod, Vercel),
invoca la skill **`context7-docs`** e leggi i docs aggiornati.

`PLAN.md` è un piano scritto a tavolino: il suo codice non è mai stato compilato e
contiene pattern già deprecati (`@supabase/auth-helpers-nextjs`, `params` non awaited,
config Tailwind v3, `response_format: json_object`, indice IVFFlat su tabella vuota,
la RPC `match_similar_reports` che filtra su colonne inesistenti, `reports` che
referenzia `clusters` prima che esista). **Se i docs contraddicono il piano, vincono i
docs**: applica la versione corretta e segnala la discrepanza in una riga.

Dopo aver implementato partendo da uno snippet del piano, esegui la skill
**`context7-check`** per verificare che l'API usata esista davvero.

Il server MCP Context7 è configurato in `.mcp.json` (keyless). Alla prima apertura del
progetto Claude Code chiede di approvarlo. Per alzare i rate limit, aggiungi l'header
`CONTEXT7_API_KEY`.

## Squadra di agenti

Ogni agente ha il proprio contesto e le proprie regole in `.claude/agents/`.
Delegare invece di fare tutto in un contesto solo è ciò che tiene il progetto
navigabile in 14 giorni.

| Agente | Dominio | Sezioni di PLAN.md |
|---|---|---|
| `voce-db-architect` | schema, migration, RLS, pgvector, PostGIS, RPC | §4 |
| `voce-ingest-engineer` | webhook Telegram/WhatsApp, form web, endpoint interni | §5.1, §5.2 |
| `voce-ai-pipeline` | triage, embedding, clustering, anonimizzazione | §5.2, §5.3 |
| `voce-dossier-legal` | atti civici, prompt giuridici, PDF/DOCX | §5.4, §5.5 |
| `voce-design-system` | token Bootstrap Italia, `packages/ui` | §1, §3 |
| `voce-frontend` | pagine App Router, mappe, Realtime, firma | §6 |
| `voce-copywriter-it` | microcopy, messaggi bot, testi legali | §3.4 |
| `voce-a11y-auditor` | WCAG 2.1 AA / AGID (sola lettura) | §3, §6 |
| `voce-privacy-gdpr` | GDPR, DPIA, sicurezza, RLS (sola lettura) | §11 |
| `voce-devops` | monorepo, Vercel, Supabase, cron, CI, segreti | §8, §9 |
| `voce-qa-pilot` | dati sintetici, E2E, qualità clustering, seed PA | §9, §13 |

**Prima di ogni deploy pubblico**: `voce-a11y-auditor` e `voce-privacy-gdpr`.
Sono in sola lettura di proposito — il loro valore è nel giudizio indipendente.

## Convenzioni

- **Interfaccia in italiano**, codice e identificatori in inglese.
  Le stringhe visibili seguono le regole di `voce-copywriter-it` (dai del tu, max 15
  parole, zero anglicismi, nessuna emoji).
- **Server Component per default**; `'use client'` va motivato.
- **RLS su ogni tabella**, sempre. La service role key non lascia mai il server.
- **Nessun atto parte senza revisione umana.** Nessun percorso di codice può saltare
  questo passaggio.
- **Coordinate**: precisione piena nel database, ~300m arrotondati lato server in
  qualunque output pubblico.
- **Dati sintetici marcati** e strutturalmente incapaci di finire in un cluster
  pubblico o in un dossier.
- Segreti mai nel repo: `.env.example` contiene solo i nomi delle variabili.

## Stato

Il repo contiene per ora solo `PLAN.md`, `LICENSE` (AGPL-3.0) e questa
configurazione. Il monorepo (`apps/web`, `apps/worker`, `packages/ui`, `packages/db`)
è da creare — punto di partenza: `voce-devops`, poi `voce-db-architect`.
