// SPDX-License-Identifier: AGPL-3.0-only
import { randomBytes } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { sql } from 'drizzle-orm'
import { Redis } from 'ioredis'
import { Client } from 'pg'
import { pino, type Logger } from 'pino'

import { validEnv } from '@/core/config/__tests__/env.fixture.js'
import { parseConfig, type Config } from '@/core/config/index.js'
import { createDatabase, type Database } from '@/core/database/index.js'

import { connectionUrl } from '../setup/migrateTemplate.js'

import type { TestInfrastructure } from '../setup/infrastructure.js'

/**
 * One test file's slice of the infrastructure: its own database (cloned from the migrated
 * template), its own logical Redis database, and the two `Database` clients over it.
 */
export interface TestDatabase {
  /** The database name; useful when connecting with psql while debugging. */
  name: string
  /** The environment a test app is parsed from: this database as `surefy_app`, this Redis. */
  env: Record<string, string>
  config: Config
  /** Connected as `surefy_app`, like the API and the worker: subject to every grant and policy. */
  db: Database
  /** Connected as `surefy_owner`, like `db:migrate`: for test-only DDL and schema queries. */
  owner: Database
  logger: Logger
  /** Empties every table in `public` (as the owner) and this Redis database. Runs after each test. */
  reset(): Promise<void>
}

let current: TestDatabase | undefined

/** The current file's database; only valid inside an integration test (setup/perFile.ts). */
export function getTestDatabase(): TestDatabase {
  if (current === undefined) {
    throw new Error('no test database: is this file in the integration project (test/**)?')
  }
  return current
}

/** `TEST_LOG_LEVEL=debug pnpm test:integration` shows the app's logs; they are silent by default. */
export const createTestLogger = (): Logger =>
  pino({ level: process.env.TEST_LOG_LEVEL ?? 'silent' })

const quoteIdentifier = (name: string) => `"${name.replaceAll('"', '""')}"`

/** `TRIGGER_TYPE_TRUNCATE` in `pg_trigger.tgtype`. */
const TRUNCATE_TRIGGER = 32

const withAdmin = async <T>(
  infrastructure: TestInfrastructure,
  fn: (client: Client) => Promise<T>,
): Promise<T> => {
  const client = new Client({ connectionString: infrastructure.postgres.adminUrl })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

/** A clone of the template, set up like infra/docker/postgres/database.sql (grants are not cloned). */
const createDatabaseFromTemplate = async (
  infrastructure: TestInfrastructure,
  name: string,
): Promise<void> => {
  const database = quoteIdentifier(name)
  const template = quoteIdentifier(infrastructure.postgres.templateDatabase)
  await withAdmin(infrastructure, async (client) => {
    await client.query(`create database ${database} template ${template} owner surefy_owner`)
    await client.query(`revoke all on database ${database} from public`)
    await client.query(`revoke temporary on database ${database} from public`)
    await client.query(`grant connect on database ${database} to surefy_app`)
  })
}

const dropDatabase = (infrastructure: TestInfrastructure, name: string) =>
  withAdmin(infrastructure, async (client) => {
    await client.query(`drop database if exists ${quoteIdentifier(name)} with (force)`)
  })

/** Every worker gets its own logical Redis database, so parallel files never share keys. */
const redisDatabaseIndex = (infrastructure: TestInfrastructure): number => {
  const poolId = Number(process.env.VITEST_POOL_ID ?? '1')
  return (Number.isNaN(poolId) ? 0 : Math.max(poolId - 1, 0)) % infrastructure.redis.databases
}

/** Creates this file's database and clients. Called once per file by setup/perFile.ts. */
export async function openTestDatabase(infrastructure: TestInfrastructure): Promise<TestDatabase> {
  if (current !== undefined) return current

  const name = `surefy_test_${randomBytes(6).toString('hex')}`
  await createDatabaseFromTemplate(infrastructure, name)
  const storagePath = await mkdtemp(join(tmpdir(), 'surefy-test-storage-'))
  const { redis, postgres } = infrastructure
  const redisUrl = `redis://${redis.host}:${redis.port}/${redisDatabaseIndex(infrastructure)}`
  const ownerUrl = connectionUrl(postgres, 'surefy_owner', name)

  const env: Record<string, string> = {
    ...validEnv,
    NODE_ENV: 'test',
    LOG_LEVEL: 'fatal', // the test logger is silent; this is for anything parsing the env itself
    DATABASE_URL: connectionUrl(postgres, 'surefy_app', name),
    DATABASE_MIGRATION_URL: ownerUrl,
    DATABASE_POOL_SIZE: '4',
    REDIS_URL: redisUrl,
    STORAGE_DRIVER: 'local',
    STORAGE_LOCAL_PATH: storagePath,
    MAIL_DRIVER: 'console',
  }
  const config = parseConfig('api', env)
  const logger = createTestLogger()
  const db = createDatabase(config, logger)
  const owner = createDatabase(config, logger, { connectionString: ownerUrl })
  const redisClient = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 2 })

  const testDatabase: TestDatabase = {
    name,
    env,
    config,
    db,
    owner,
    logger,
    async reset() {
      await Promise.all([truncateAllTables(owner), redisClient.flushdb()])
    },
  }
  current = testDatabase
  closeCurrent = async () => {
    current = undefined
    await Promise.all([db.close(), owner.close(), redisClient.quit()])
    await Promise.all([dropDatabase(infrastructure, name), rm(storagePath, { recursive: true })])
  }
  return testDatabase
}

let closeCurrent: (() => Promise<void>) | undefined

/** Closes the clients and drops this file's database. Called once per file by setup/perFile.ts. */
export async function closeTestDatabase(): Promise<void> {
  const close = closeCurrent
  closeCurrent = undefined
  await close?.()
}

/**
 * Tables are truncated between tests (testing.md, §2). The owner runs it: `surefy_app` has no
 * TRUNCATE anywhere, and TRUNCATE is not subject to row-level security.
 */
export async function truncateAllTables(owner: Database): Promise<void> {
  const tables = await owner.global.execute<{ name: string }>(sql`
    select c.relname as name
    from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('r', 'p') and not c.relispartition`)
  if (tables.rows.length === 0) return
  const list = tables.rows.map((row) => quoteIdentifier(row.name)).join(', ')
  // Append-only tables refuse TRUNCATE with a trigger (audit_logs); the owner switches their user
  // triggers off for this transaction only.
  const guarded = await owner.global.execute<{ name: string }>(sql`
    select distinct c.relname as name
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    where c.relnamespace = 'public'::regnamespace and not t.tgisinternal
      and (t.tgtype & ${TRUNCATE_TRIGGER}) <> 0`)
  const toggle = (state: 'disable' | 'enable') =>
    guarded.rows.map((row) => `alter table ${quoteIdentifier(row.name)} ${state} trigger user;`)
  await owner.global.transaction(async (tx) => {
    for (const statement of toggle('disable')) await tx.execute(sql.raw(statement))
    await tx.execute(sql.raw(`truncate table ${list} restart identity cascade`))
    for (const statement of toggle('enable')) await tx.execute(sql.raw(statement))
  })
}
