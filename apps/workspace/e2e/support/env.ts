// SPDX-License-Identifier: AGPL-3.0-only
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** The repository root, three levels above `apps/workspace/e2e/support`. */
export const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

const REDIS_DATABASES = 16

/**
 * A worktree's ports and database name come from its `.env.worktree`; the process environment
 * wins (CI). Without either, the default dev ports.
 */
function readWorktreeEnv(): Record<string, string> {
  const file = `${REPO_ROOT}.env.worktree`
  if (!existsSync(file)) return {}
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => {
        const at = line.indexOf('=')
        return [line.slice(0, at), line.slice(at + 1).trim()]
      }),
  )
}

const worktree = readWorktreeEnv()
const read = (key: string, fallback: string) => process.env[key] ?? worktree[key] ?? fallback

const slot = Number(read('WORKTREE_SLOT', '0'))
const postgresPort = read('POSTGRES_PORT', '54320')
const redisPort = read('REDIS_PORT', '63790')

/** Everything the end-to-end run needs to know about where things listen. */
export const e2e = {
  webPort: Number(read('WEB_PORT', '3000')),
  apiPort: Number(read('API_PORT', '4000')),
  /** Its own database, recreated on every run, next to the worktree's development one. */
  database: `${read('DATABASE_NAME', 'surefy')}_e2e`,
  /** Its own Redis database, so rate limits of earlier runs never carry over. */
  redisDatabase: 1 + (slot % (REDIS_DATABASES - 1)),
  postgresPort,
  redisPort,
  /** The stub OpenAI-compatible model server (`modelServer.ts`), next to the worktree's ports. */
  modelPort: Number(read('MODEL_STUB_PORT', String(Number(read('API_PORT', '4000')) + 9))),
}

export const webUrl = `http://localhost:${String(e2e.webPort)}`
export const apiUrl = `http://localhost:${String(e2e.apiPort)}`
export const modelServerUrl = `http://127.0.0.1:${String(e2e.modelPort)}`

/** The one model the stub server lists; the chat specs connect it and enable it in the Vault. */
export const STUB_MODEL_ID = 'e2e-echo'
/** The stub answers "Echo: <question>"; a question starting with this gets a long answer. */
export const LONG_ANSWER_PREFIX = 'Tell me a long story'

const TITLE_WORDS = 6

/**
 * The title the stub gives a chat: the first words of the first question. The title request's
 * prompt is "Question:\n<question>\n\nAnswer:\n<answer>".
 */
export function stubTitle(prompt: string): string {
  const question = prompt.replace(/^Question:\n/, '').split('\n')[0] ?? ''
  return question
    .split(/\s+/)
    .slice(0, TITLE_WORDS)
    .join(' ')
    .replace(/[?.!]$/, '')
}

const ownerPassword = read('SUREFY_OWNER_PASSWORD', 'surefy_owner')
const appPassword = read('SUREFY_APP_PASSWORD', 'surefy_app')
/** The two application roles' passwords, as the dev compose file sets them. */
export const rolePasswords = { owner: ownerPassword, app: appPassword }

const databaseUrl = (role: string, password: string) =>
  `postgres://${role}:${password}@127.0.0.1:${postgresPort}/${e2e.database}`

/** The API's environment for the run: the e2e database, fixed test secrets, mail to the console. */
export function apiEnv(): Record<string, string> {
  return {
    NODE_ENV: 'development',
    API_PORT: String(e2e.apiPort),
    API_HOST: '127.0.0.1',
    API_PUBLIC_URL: apiUrl,
    APP_ORIGIN: webUrl,
    LOG_LEVEL: 'warn',
    DATABASE_URL: databaseUrl('surefy_app', appPassword),
    DATABASE_MIGRATION_URL: databaseUrl('surefy_owner', ownerPassword),
    REDIS_URL: `redis://127.0.0.1:${redisPort}/${String(e2e.redisDatabase)}`,
    AUTH_SECRET: 'e2e-auth-secret-not-for-real-installs-0001',
    ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    ML_SERVICE_URL: 'http://127.0.0.1:18000',
    ML_SERVICE_TOKEN: 'e2e-ml-service-token-not-for-real-installs',
    STORAGE_DRIVER: 'local',
    STORAGE_LOCAL_PATH: `${REPO_ROOT}apps/api/data/e2e-storage`,
    MAIL_DRIVER: 'console',
  }
}

/** The web app's environment: the API it calls from the server and through the `/api` rewrite. */
export function webEnv(): Record<string, string> {
  return {
    WEB_PORT: String(e2e.webPort),
    API_PORT: String(e2e.apiPort),
    INTERNAL_API_URL: apiUrl,
  }
}

// New on every run. The config loads this file in the runner first, and the workers it starts
// inherit the variable, so the setup project and the specs that sign in again share one password.
process.env.E2E_OWNER_PASSWORD ??= `E2e-${randomBytes(12).toString('base64url')}`

/**
 * The Owner and organization the setup wizard creates: test credentials only, never a real
 * account. The specs reuse the setup project's session; the sign-in specs sign in again.
 */
export const OWNER = {
  name: 'Maya Okafor',
  email: 'owner@e2e.test',
  password: process.env.E2E_OWNER_PASSWORD,
}

export const ORGANIZATION = { name: 'Acme Logistics', slug: 'acme' }

/** Where the signed-in Owner's cookies are kept between the setup project and the specs. */
export const OWNER_STATE = fileURLToPath(new URL('../.auth/owner.json', import.meta.url))
