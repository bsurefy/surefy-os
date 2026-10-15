// SPDX-License-Identifier: AGPL-3.0-only
import { execFileSync } from 'node:child_process'

import { e2e, REPO_ROOT, workerEnv } from './env'

const run = (command: string, args: string[], env: Record<string, string> = {}) => {
  execFileSync(command, args, {
    cwd: REPO_ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'ignore', 'inherit'],
  })
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const MODEL_KEY = /^[\w./:-]+$/

/** Builds the API's container with the run's environment and runs the hourly rollup once. */
const ROLL_UP = `
const { loadConfig } = await import('./src/core/config/index.ts')
const { createContainer } = await import('./src/container.ts')
const container = await createContainer(loadConfig('cli'))
try {
  await container.modules.usage.rollup.aggregate('hourly')
} finally {
  await container.close()
}
`

/**
 * Runs the usage rollup the worker schedules at five past every hour (`aggregate-usage-hourly`),
 * with the API's own code: the daily usage, the runs per agent (`run_stats_daily`) and the budget
 * counters' reconciliation. The run KPIs and longer ranges read what it builds.
 */
export function rollUpUsage(): void {
  run(
    'pnpm',
    ['--filter', '@surefy/api', 'exec', 'tsx', '--input-type=module', '--eval', ROLL_UP],
    workerEnv(),
  )
}

/**
 * Gives a model a price per million tokens, in micros of US dollars (null takes it away). The
 * Vault reads prices from the provider's catalog and has no API to set them; an OpenAI-compatible
 * server has none, so without this its calls cost nothing. Written with `psql` as the database
 * owner, the way `prepareDatabase.ts` sets the database up.
 */
export function priceModel(
  organizationId: string,
  modelKey: string,
  microsPerMillionTokens: number | null,
): void {
  if (!UUID.test(organizationId) || !MODEL_KEY.test(modelKey)) {
    throw new Error('Expected an organization id and a model key')
  }
  const price =
    microsPerMillionTokens === null ? 'null' : String(Math.trunc(microsPerMillionTokens))
  run('docker', [
    'compose',
    '-f',
    `${REPO_ROOT}infra/docker/compose.dev.yml`,
    'exec',
    '-T',
    'postgres',
    'psql',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'postgres',
    '-d',
    e2e.database,
    '-c',
    `update vault_models set input_price_per_mtok_micros = ${price}, ` +
      `output_price_per_mtok_micros = ${price}, currency = 'USD' ` +
      `where organization_id = '${organizationId}' and model_key = '${modelKey}'`,
  ])
}
