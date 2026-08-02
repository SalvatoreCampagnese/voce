/**
 * Accesso alle variabili d'ambiente — contratto di build §6.
 *
 * REGOLE (non negoziabili)
 * 1. Nessun `process.env.X` altrove nel codice: si passa sempre da qui.
 * 2. `publicEnv` contiene **solo** ciò che può raggiungere il browser: URL del
 *    progetto Supabase e chiave anon. Nient'altro, mai.
 * 3. `serverEnv` contiene i segreti.
 *
 * PERCHÉ NON C'È `import 'server-only'`
 * Il pacchetto `server-only` non è installato in questo repo e il contratto §1
 * vieta di aggiungere dipendenze. La barriera è quindi a runtime: ogni accesso
 * a `serverEnv` da un contesto browser lancia un errore.
 * Va detto con chiarezza che questa è una rete di sicurezza, non la garanzia:
 * la garanzia vera è che Next.js inlinea nel bundle client **solo** le
 * variabili `NEXT_PUBLIC_*`. Un segreto letto qui vale `undefined` nel
 * browser, quindi non c'è nulla da esfiltrare — il controllo runtime serve a
 * far fallire subito e in modo comprensibile chi importa il modulo sbagliato.
 *
 * VALIDAZIONE
 * Le variabili pubbliche si validano all'import. Quelle server si validano
 * all'avvio del processo server (import del modulo), così un deploy senza
 * segreti fallisce subito invece che alla prima segnalazione di un cittadino.
 * In CI, dove i segreti non ci sono e serve solo compilare, si passa
 * `SKIP_ENV_VALIDATION=1`.
 */

import { z } from 'zod'

import { ACTION_THRESHOLD_CITIZENS } from './constants'

/**
 * Scorciatoia per build e typecheck senza segreti (CI su pull request).
 * Non usarla mai in un ambiente che serve traffico reale.
 */
const validationSkipped =
  process.env.SKIP_ENV_VALIDATION === '1' || process.env.SKIP_ENV_VALIDATION === 'true'

const isBrowser = typeof window !== 'undefined'

// ---------------------------------------------------------------------------
// Schemi
// ---------------------------------------------------------------------------

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(
    'NEXT_PUBLIC_SUPABASE_URL deve essere l\'URL del progetto Supabase (https://xxx.supabase.co)',
  ),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(20, 'NEXT_PUBLIC_SUPABASE_ANON_KEY sembra troppo corta per essere una chiave anon'),
})

export type PublicEnv = z.infer<typeof publicEnvSchema>

const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(20, 'SUPABASE_SERVICE_ROLE_KEY mancante: la trovi in Supabase → Project Settings → API'),

  OPENAI_API_KEY: z
    .string()
    .regex(
      /^sk-[A-Za-z0-9_-]{20,}$/,
      'OPENAI_API_KEY deve iniziare con "sk-": controlla di aver incollato la chiave e non l\'id del progetto',
    ),

  TELEGRAM_BOT_TOKEN: z
    .string()
    .regex(
      /^\d+:[A-Za-z0-9_-]{30,}$/,
      'TELEGRAM_BOT_TOKEN ha un formato inatteso: deve essere "123456:AA..." come lo dà BotFather',
    ),
  TELEGRAM_WEBHOOK_SECRET: z
    .string()
    .regex(
      /^[A-Za-z0-9_-]{16,256}$/,
      'TELEGRAM_WEBHOOK_SECRET deve avere almeno 16 caratteri fra A-Z a-z 0-9 _ - (openssl rand -hex 32)',
    ),

  TWILIO_ACCOUNT_SID: z
    .string()
    .regex(
      /^AC[0-9a-fA-F]{32}$/,
      'TWILIO_ACCOUNT_SID deve iniziare con "AC" seguito da 32 caratteri esadecimali',
    ),
  TWILIO_AUTH_TOKEN: z.string().min(20, 'TWILIO_AUTH_TOKEN mancante'),
  TWILIO_WHATSAPP_NUMBER: z
    .string()
    .regex(
      /^whatsapp:\+[1-9]\d{6,14}$/,
      'TWILIO_WHATSAPP_NUMBER va scritto nel formato "whatsapp:+14155238886"',
    ),

  INTERNAL_KEY: z
    .string()
    .min(32, 'INTERNAL_KEY troppo corta: generala con `openssl rand -hex 32`'),
  CRON_SECRET: z
    .string()
    .min(32, 'CRON_SECRET troppo corta: generala con `openssl rand -hex 32`'),
  IP_HASH_SALT: z
    .string()
    .min(16, 'IP_HASH_SALT troppo corto: generalo con `openssl rand -hex 32`'),

  APP_URL: z
    .url('APP_URL deve essere un URL assoluto (http://localhost:3000 in locale)')
    .transform((value) => value.replace(/\/+$/, '')),

  ACTION_THRESHOLD_CITIZENS: z.preprocess(
    // Una riga `ACTION_THRESHOLD_CITIZENS=` copiata da .env.example vale stringa
    // vuota: va trattata come "non impostata", non come zero.
    (value) => (value === undefined || value === '' ? ACTION_THRESHOLD_CITIZENS : value),
    z.coerce
      .number()
      .int('ACTION_THRESHOLD_CITIZENS deve essere un numero intero')
      .positive('ACTION_THRESHOLD_CITIZENS deve essere maggiore di zero'),
  ),
})

export type ServerEnv = z.infer<typeof serverEnvSchema>

const serverEnvKeys = Object.keys(serverEnvSchema.shape) as (keyof ServerEnv)[]

// ---------------------------------------------------------------------------
// Messaggi di errore leggibili
// ---------------------------------------------------------------------------

function formatIssues(scope: string, error: z.ZodError<unknown>): string {
  // Una riga per variabile, in italiano: il caso «non impostata» ha un messaggio
  // predefinito di Zod in inglese che non aiuta chi sta configurando il progetto.
  const seen = new Set<string>()
  const lines: string[] = []

  for (const issue of error.issues) {
    const name = issue.path.length > 0 ? issue.path.join('.') : '(radice)'
    if (seen.has(name)) continue
    seen.add(name)

    const message =
      issue.code === 'invalid_type' ? 'variabile non impostata' : issue.message
    lines.push(`  · ${name}: ${message}`)
  }

  return [
    `Configurazione ${scope} non valida. Variabili mancanti o non valide:`,
    ...lines,
    '',
    'Cosa fare:',
    '  1. copia .env.example in apps/web/.env.local',
    '  2. completa i valori seguendo GUIDE.md',
    '  3. i segreti interni si generano con `openssl rand -hex 32`',
    '',
    'Su Vercel le stesse variabili vanno in Project Settings → Environment Variables.',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Variabili pubbliche
// ---------------------------------------------------------------------------

/**
 * Le letture devono essere letterali (`process.env.NEXT_PUBLIC_X`): è così che
 * Next.js le sostituisce con il valore nel bundle del browser. Un accesso
 * dinamico (`process.env[nome]`) nel client restituirebbe `undefined`.
 */
const rawPublicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
}

function parsePublicEnv(): PublicEnv {
  const parsed = publicEnvSchema.safeParse(rawPublicEnv)
  if (parsed.success) return parsed.data

  if (validationSkipped) {
    console.warn(
      '[env] SKIP_ENV_VALIDATION attivo: variabili pubbliche non validate. Build non deployabile.',
    )
    return {
      NEXT_PUBLIC_SUPABASE_URL: rawPublicEnv.NEXT_PUBLIC_SUPABASE_URL ?? '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: rawPublicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    }
  }

  throw new Error(formatIssues('pubblica', parsed.error))
}

/** URL e chiave anon di Supabase. Sono gli unici valori che possono finire nel browser. */
export const publicEnv: PublicEnv = parsePublicEnv()

// ---------------------------------------------------------------------------
// Variabili server (segreti)
// ---------------------------------------------------------------------------

let cachedServerEnv: ServerEnv | null = null

function skippedServerEnv(): ServerEnv {
  // Usata solo con SKIP_ENV_VALIDATION: i valori assenti restano stringhe
  // vuote. `assertInternalKey`/`assertCronSecret` rifiutano ogni richiesta
  // quando il segreto atteso è vuoto, quindi una build "saltata" non apre
  // buchi: semplicemente non autentica nessuno.
  return {
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ?? '',
    TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET ?? '',
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID ?? '',
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN ?? '',
    TWILIO_WHATSAPP_NUMBER: process.env.TWILIO_WHATSAPP_NUMBER ?? '',
    INTERNAL_KEY: process.env.INTERNAL_KEY ?? '',
    CRON_SECRET: process.env.CRON_SECRET ?? '',
    IP_HASH_SALT: process.env.IP_HASH_SALT ?? '',
    APP_URL: (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, ''),
    ACTION_THRESHOLD_CITIZENS:
      Number.parseInt(process.env.ACTION_THRESHOLD_CITIZENS ?? '', 10) || ACTION_THRESHOLD_CITIZENS,
  }
}

function assertNotBrowser(): void {
  if (isBrowser) {
    throw new Error(
      'Le variabili server di VOCE non sono accessibili dal browser. ' +
        'Stai importando lib/config/env in un Client Component: usa publicEnv, ' +
        'oppure sposta la logica in un Server Component o in un Route Handler.',
    )
  }
}

const cachedServerVars = new Map<keyof ServerEnv, unknown>()

/**
 * Legge e valida UNA variabile server, alla prima lettura.
 *
 * Perché per variabile e non tutte insieme: VOCE si configura per pezzi.
 * GUIDE.md fa creare il progetto Supabase al passo 1 e il bot Telegram al
 * passo 3; in mezzo si deve poter aprire il sito. Con una validazione globale,
 * la pagina pubblica si rifiutava di rendere finché non esisteva un token
 * Telegram che quella pagina non usa nemmeno.
 *
 * La severità resta: chi tocca il webhook Telegram senza token riceve subito un
 * errore esplicito, e in produzione `assertServerEnvComplete()` controlla tutto
 * in una volta (vedi /api/health).
 */
function getServerVar<K extends keyof ServerEnv>(key: K): ServerEnv[K] {
  assertNotBrowser()

  if (cachedServerVars.has(key)) return cachedServerVars.get(key) as ServerEnv[K]

  // Doppio cast: le forme dello shape sono eterogenee (ZodString, ZodPipe,
  // ZodPreprocess) e TypeScript non le riconduce da solo al tipo della chiave.
  const field = serverEnvSchema.shape[key] as unknown as z.ZodType<ServerEnv[K]>
  const parsed = field.safeParse(process.env[key])

  if (parsed.success) {
    cachedServerVars.set(key, parsed.data)
    return parsed.data
  }

  if (validationSkipped) {
    const fallback = skippedServerEnv()[key]
    cachedServerVars.set(key, fallback)
    return fallback
  }

  const dettaglio = parsed.error.issues
    .map((issue) => (issue.code === 'invalid_type' ? 'variabile non impostata' : issue.message))
    .join(' · ')

  throw new Error(
    `Configurazione mancante: ${key} — ${dettaglio}\n` +
      `Impostala in apps/web/.env.local (in locale) o nelle Environment Variables di Vercel.\n` +
      `I passi per ottenerla sono in GUIDE.md.`,
  )
}

/**
 * Valida TUTTE le variabili server in una volta. Non viene chiamata
 * all'import: usala in un controllo di salute o prima di un rilascio, quando
 * vuoi sapere se l'ambiente è completo invece di scoprirlo un pezzo alla volta.
 */
export function getServerEnv(): ServerEnv {
  assertNotBrowser()

  if (cachedServerEnv) return cachedServerEnv

  const parsed = serverEnvSchema.safeParse(process.env)
  if (parsed.success) {
    cachedServerEnv = parsed.data
    return cachedServerEnv
  }

  if (validationSkipped) {
    console.warn(
      '[env] SKIP_ENV_VALIDATION attivo: segreti non validati. Non servire traffico con questa build.',
    )
    cachedServerEnv = skippedServerEnv()
    return cachedServerEnv
  }

  throw new Error(formatIssues('server', parsed.error))
}

/** Come getServerEnv, ma restituisce l'elenco dei problemi invece di lanciare. */
export function verificaConfigurazioneServer(): { completa: boolean; problemi: string[] } {
  assertNotBrowser()
  const parsed = serverEnvSchema.safeParse(process.env)
  if (parsed.success) return { completa: true, problemi: [] }
  return {
    completa: false,
    problemi: parsed.error.issues.map((issue) => {
      const nome = issue.path.length > 0 ? issue.path.join('.') : '(radice)'
      return `${nome}: ${issue.code === 'invalid_type' ? 'non impostata' : issue.message}`
    }),
  }
}

/**
 * Segreti applicativi. **Solo server.**
 *
 * È un Proxy e non un oggetto semplice per due motivi: l'accesso da browser
 * deve lanciare un errore parlante, e nessun bundler deve poter inlineare
 * questi valori da qualche parte per errore.
 */
export const serverEnv: ServerEnv = new Proxy({} as ServerEnv, {
  get(_target, property) {
    if (typeof property !== 'string') return undefined
    if (!serverEnvKeys.includes(property as keyof ServerEnv)) return undefined
    return getServerVar(property as keyof ServerEnv)
  },
  has(_target, property) {
    return typeof property === 'string' && serverEnvKeys.includes(property as keyof ServerEnv)
  },
  ownKeys() {
    return [...serverEnvKeys]
  },
  getOwnPropertyDescriptor(_target, property) {
    if (typeof property !== 'string') return undefined
    if (!serverEnvKeys.includes(property as keyof ServerEnv)) return undefined
    return {
      configurable: true,
      enumerable: true,
      writable: false,
      value: getServerVar(property as keyof ServerEnv),
    }
  },
})

// Nessuna validazione all'import.
//
// Prima qui c'era una chiamata eager a getServerEnv(): siccome `publicEnv` e
// `serverEnv` vivono nello stesso modulo, bastava che una pagina pubblica
// importasse le variabili pubbliche per pretendere anche il token Telegram e
// le credenziali Twilio. Risultato: il sito non compilava finché ogni servizio
// esterno non era configurato, all'opposto dell'ordine di setup di GUIDE.md.
//
// Ora ogni variabile si valida alla prima lettura (vedi getServerVar), e la
// verifica d'insieme si fa esplicitamente con verificaConfigurazioneServer()
// da /api/health prima di mandare traffico vero su un deploy.
