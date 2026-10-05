// SPDX-License-Identifier: AGPL-3.0-only
// Runs before Playwright (`test:e2e`): the web servers start first and the API needs its tables.
// Recreates the e2e database, empties its Redis database and runs the migrations.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import { apiEnv, e2e, REPO_ROOT, rolePasswords } from './env'

const compose = ['compose', '-f', `${REPO_ROOT}infra/docker/compose.dev.yml`]
const run = (
  command: string,
  args: string[],
  { env = {}, input }: { env?: Record<string, string>; input?: string } = {},
) => {
  execFileSync(command, args, {
    cwd: REPO_ROOT,
    stdio: [input === undefined ? 'inherit' : 'pipe', 'inherit', 'inherit'],
    env: { ...process.env, ...env },
    ...(input === undefined ? {} : { input }),
  })
}
const psql = ['exec', '-T', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres']

run('docker', [
  ...compose,
  ...psql,
  '-d',
  'postgres',
  '-c',
  `drop database if exists "${e2e.database}" with (force)`,
])
// the bootstrap scripts go in on stdin, so the run does not depend on the container's mounts;
// both are idempotent, and the roles' grants follow the current migrations
const bootstrap = (file: string) =>
  readFileSync(`${REPO_ROOT}infra/docker/postgres/${file}`, 'utf8')
run(
  'docker',
  [
    ...compose,
    ...psql,
    '-d',
    'postgres',
    '-v',
    `owner_password=${rolePasswords.owner}`,
    '-v',
    `app_password=${rolePasswords.app}`,
    '-f',
    '-',
  ],
  { input: bootstrap('roles.sql') },
)
run('docker', [...compose, ...psql, '-d', 'postgres', '-v', `db=${e2e.database}`, '-f', '-'], {
  input: bootstrap('database.sql'),
})
run('docker', [
  ...compose,
  'exec',
  '-T',
  'redis',
  'redis-cli',
  '-n',
  String(e2e.redisDatabase),
  'flushdb',
])
run('pnpm', ['--filter', '@surefy/api', 'db:migrate'], { env: apiEnv() })
