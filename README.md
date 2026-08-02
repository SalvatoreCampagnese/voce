# VOCE

**Il primo sindacato civico automatico.**

Racconta un problema del tuo quartiere in un messaggio. Se non sei da solo, VOCE se ne
accorge: mette insieme la tua segnalazione con quelle di chi ha lo stesso problema,
scrive l'atto che serve — un esposto, un accesso civico, una mozione — e lo pubblica in
un quadro di trasparenza che chiunque può controllare.

Nessuno deve organizzare niente. È il punto.

[![Licenza: AGPL v3](https://img.shields.io/badge/licenza-AGPL--3.0-blue.svg)](LICENSE)

---

## Come funziona

```
   Cittadino                  VOCE                        Istituzione
   ─────────                  ────                        ───────────
   Telegram  ─┐
   WhatsApp  ─┼──►  ingestione ──► triage AI ──► gruppo ──► atto ──► firma ──► invio
   Sito web  ─┘                    (categoria,   (segnala-  (bozza)   (cittadini)
                                    urgenza,      zioni
                                    luogo)        simili)
                                                     │
                                                     ▼
                                            quadro pubblico
                                         (chiunque può verificare)
```

1. **Racconti.** In italiano normale, su WhatsApp o Telegram, come lo diresti a un amico.
2. **Aggreghiamo.** Un modello linguistico estrae categoria, urgenza e luogo; un
   embedding trova le segnalazioni che parlano dello stesso problema nella stessa zona.
3. **Agiamo.** Quando abbastanza persone distinte segnalano la stessa cosa, VOCE genera
   le bozze degli atti. **Ogni atto è revisionato da una persona prima di partire.**
4. **Verifichi.** Gruppi, atti e risposte delle amministrazioni sono pubblici.

---

## Stack

| Livello | Scelta |
|---|---|
| Web | Next.js 16 (App Router, Server Components) su Vercel |
| Dati | Supabase — Postgres, RLS, pgvector, PostGIS, Auth, Storage, Realtime |
| AI | OpenAI `gpt-4o-mini` (triage e atti) + `text-embedding-3-small` |
| UI | Tailwind CSS v4 con i design token di [Bootstrap Italia](https://italia.github.io/bootstrap-italia) |
| Canali | Bot Telegram nativo · WhatsApp via Twilio |

L'interfaccia riproduce i pattern visivi dei servizi pubblici italiani. Non è
nostalgia: è la ragione per cui un cittadino capisce in tre secondi che VOCE è una cosa
seria, e per cui l'accessibilità WCAG 2.1 AA è il punto di partenza e non un ripensamento.

---

## Setup locale in 10 minuti

Servono Node 22+, pnpm 9+, e Docker se vuoi il database in locale.

```bash
git clone https://github.com/SalvatoreCampagnese/voce.git
cd voce
pnpm install

# database locale (oppure collega un progetto Supabase cloud)
supabase start
supabase db reset

cp apps/web/.env.example apps/web/.env.local   # e compila i valori
pnpm dev                                        # http://localhost:3000
pnpm seed                                       # dati sintetici per vedere l'interfaccia piena
```

Le chiavi da procurarsi (Supabase, OpenAI, Telegram, Twilio) e ogni clic da fare nelle
console dei servizi sono spiegati passo per passo in **[GUIDE.md](GUIDE.md)**.

---

## Struttura del repo

```
apps/web/              applicazione Next.js (pagine, API, logica)
  app/                 App Router: pagine pubbliche, area autenticata, route handler
  lib/                 supabase, pipeline AI, sicurezza, utility
packages/ui/           design system istituzionale condiviso
packages/db/           tipi del database e seed
supabase/migrations/   schema SQL: tabelle, RLS, funzioni, view pubbliche
docs/                  contratto di build e documentazione tecnica
```

| Documento | A cosa serve |
|---|---|
| [PLAN.md](PLAN.md) | il piano di prodotto completo, 14 giorni |
| [GUIDE.md](GUIDE.md) | **cosa devi fare tu a mano**: chiavi, console, decisioni legali |
| [docs/BUILD-CONTRACT.md](docs/BUILD-CONTRACT.md) | decisioni tecniche vincolanti |
| [CLAUDE.md](CLAUDE.md) | convenzioni per chi (o cosa) scrive codice qui |

---

## Privacy — cosa facciamo dei dati

VOCE raccoglie da cittadini identificabili delle critiche a istituzioni pubbliche.
È una combinazione delicata, e il progetto la tratta come tale:

- **Row Level Security su ogni tabella.** Nessun cittadino può leggere le segnalazioni
  di un altro. Mai.
- **Il testo grezzo non diventa mai pubblico.** Le pagine pubbliche mostrano solo una
  versione anonimizzata, senza nomi propri.
- **Le coordinate sono arrotondate a 300 metri** prima di lasciare il server.
- **Un gruppo diventa pubblico solo sopra una soglia minima di persone distinte**:
  sotto quella soglia, mostrarlo equivarrebbe a indicare chi ha parlato.
- **Nessun atto parte senza revisione umana**, e ogni atto dichiara di essere stato
  scritto con l'aiuto dell'AI.

Prima di far entrare cittadini veri servono una DPIA, un'informativa e una verifica
legale della base giuridica: leggi il passo 9 di [GUIDE.md](GUIDE.md). Non è
burocrazia — è la differenza tra proteggere le persone che si fidano di te e no.

---

## Contribuire

Il codice è AGPL-3.0: chi lo usa per offrire un servizio deve ripubblicare le modifiche.
Un'infrastruttura civica non può diventare il prodotto chiuso di qualcuno.

Se vuoi portare VOCE nel tuo comune, servono: i contatti PA del territorio, un referente
locale in carne e ossa, e la stessa cura sui dati. Apri una issue: ne parliamo.

---

## Licenza

[AGPL-3.0](LICENSE)
