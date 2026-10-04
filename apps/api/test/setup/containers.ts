// SPDX-License-Identifier: AGPL-3.0-only
import { fileURLToPath } from 'node:url'

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis'

import type { TestInfrastructure } from './infrastructure.js'

// The same images as the development stack (infra/docker/compose.dev.yml).
export const POSTGRES_IMAGE = 'pgvector/pgvector:pg18'
export const REDIS_IMAGE = 'redis:8-alpine'

/** The database the global setup migrates; test files clone it (testing.md, §2). */
export const TEMPLATE_DATABASE = 'surefy_template'
// Throwaway containers; the same development defaults as compose.dev.yml.
// eslint-disable-next-line sonarjs/no-hardcoded-passwords -- test container, never reachable from outside
export const OWNER_PASSWORD = 'surefy_owner'
// eslint-disable-next-line sonarjs/no-hardcoded-passwords -- test container, never reachable from outside
export const APP_PASSWORD = 'surefy_app'
/** Enough logical Redis databases for one per Vitest worker. */
export const REDIS_DATABASES = 64

const ADMIN_USER = 'postgres'
const ADMIN_PASSWORD = 'postgres'

/**
 * The bootstrap the bundled Postgres runs on first start (roles, database, extension, grants).
 * Copied into the container unchanged, so tests run against exactly the roles production gets.
 */
const INFRA_POSTGRES = fileURLToPath(new URL('../../../../infra/docker/postgres/', import.meta.url))

export interface StartedContainers {
  postgres: StartedPostgreSqlContainer
  redis: StartedRedisContainer
  infrastructure: TestInfrastructure
  stop(): Promise<void>
}

const startPostgres = () =>
  new PostgreSqlContainer(POSTGRES_IMAGE)
    .withDatabase('postgres') // the entrypoint creates no extra database; the init script does
    .withUsername(ADMIN_USER)
    .withPassword(ADMIN_PASSWORD)
    .withEnvironment({
      SUREFY_OWNER_PASSWORD: OWNER_PASSWORD,
      SUREFY_APP_PASSWORD: APP_PASSWORD,
      SUREFY_DATABASE: TEMPLATE_DATABASE,
    })
    .withCopyFilesToContainer([
      { source: `${INFRA_POSTGRES}roles.sql`, target: '/surefy/roles.sql' },
      { source: `${INFRA_POSTGRES}database.sql`, target: '/surefy/database.sql' },
      {
        source: `${INFRA_POSTGRES}init.sh`,
        target: '/docker-entrypoint-initdb.d/10-init.sh',
        mode: 0o755,
      },
    ])
    // Throwaway data: keep it in memory and skip durability work.
    .withTmpFs({ '/var/lib/postgresql': 'rw' })
    .withCommand([
      'postgres',
      '-c',
      'fsync=off',
      '-c',
      'synchronous_commit=off',
      '-c',
      'full_page_writes=off',
    ])
    .start()

const startRedis = () =>
  new RedisContainer(REDIS_IMAGE)
    .withCommand(['redis-server', '--databases', String(REDIS_DATABASES), '--save', ''])
    .start()

/** Starts Postgres and Redis side by side, on random host ports, and describes them. */
export async function startContainers(): Promise<StartedContainers> {
  const [postgres, redis] = await Promise.all([startPostgres(), startRedis()])
  const infrastructure: TestInfrastructure = {
    postgres: {
      host: postgres.getHost(),
      port: postgres.getPort(),
      adminUrl: postgres.getConnectionUri(),
      templateDatabase: TEMPLATE_DATABASE,
      ownerPassword: OWNER_PASSWORD,
      appPassword: APP_PASSWORD,
    },
    redis: { host: redis.getHost(), port: redis.getPort(), databases: REDIS_DATABASES },
  }
  return {
    postgres,
    redis,
    infrastructure,
    async stop() {
      await Promise.all([postgres.stop(), redis.stop()])
    },
  }
}
