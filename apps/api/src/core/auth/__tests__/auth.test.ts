// SPDX-License-Identifier: AGPL-3.0-only
import { getAuthTables } from 'better-auth/db'
import { getTableColumns } from 'drizzle-orm'
import { pino } from 'pino'
import { describe, expect, it } from 'vitest'

import { validEnv } from '@/core/config/__tests__/env.fixture.js'
import { parseConfig } from '@/core/config/index.js'
import { createDatabase } from '@/core/database/index.js'
import { accounts, sessions, twoFactors, users, verifications } from '@/database/tables/index.js'

import { createAuth } from '../auth.js'
import { appOfUrl, authAllowedHosts, trustedOriginOf } from '../origins.js'

import type { CacheClient } from '@/core/cache/index.js'
import type { PgTable } from 'drizzle-orm/pg-core'

const config = parseConfig('api', {
  ...validEnv,
  CONSOLE_ORIGIN: 'https://console.example',
  PARTNER_ORIGIN: 'https://partner.example',
})

/** Better Auth over a pool that never connects: only its options are read. */
const buildAuth = () => {
  const logger = pino({ level: 'silent' })
  const db = createDatabase(config, logger)
  const never = () => Promise.reject(new Error('not used'))
  return {
    db,
    auth: createAuth({
      config,
      db,
      redis: {} as CacheClient,
      logger,
      emails: { verifyEmail: never, passwordReset: never },
      signup: { allows: () => Promise.resolve(false) },
      users: { isDisabled: () => Promise.resolve(false) },
      plugins: [],
    }),
  }
}

const TABLES: Record<string, PgTable> = {
  user: users,
  session: sessions,
  account: accounts,
  verification: verifications,
  twoFactor: twoFactors,
}

const SQL_TYPES: Record<string, string> = {
  string: 'PgText',
  boolean: 'PgBoolean',
  date: 'PgTimestamp',
  number: 'PgInteger',
}

type ExpectedTables = ReturnType<typeof getAuthTables>

/** The differences between one Better Auth model and its Drizzle table. */
const problemsOf = (model: string, fields: ExpectedTables[string]['fields']): string[] => {
  const table = TABLES[model]
  if (table === undefined) return [`no table for model ${model}`]
  const columns = getTableColumns(table)
  const problems: string[] = []
  for (const [field, attribute] of Object.entries(fields)) {
    const column = columns[field]
    if (column === undefined) {
      problems.push(`${model}.${field} missing`)
      continue
    }
    const isUuidReference = field.endsWith('Id') && column.columnType === 'PgUUID'
    const type = attribute.type as string
    if (!isUuidReference && SQL_TYPES[type] !== column.columnType) {
      problems.push(`${model}.${field}: ${column.columnType} for ${type}`)
    }
    if (attribute.required === true && !column.notNull) problems.push(`${model}.${field} nullable`)
  }
  return problems
}

describe('auth.tables.ts', () => {
  it('has every field Better Auth expects for this configuration, with its type and nullability', async () => {
    const { auth, db } = buildAuth()
    const expected = getAuthTables(auth.options)
    const problems = Object.entries(expected).flatMap(([model, definition]) =>
      problemsOf(model, definition.fields),
    )
    expect(problems).toEqual([])
    await db.close()
  })
})

describe('origins', () => {
  it('allows the web apps and the public API host', () => {
    expect(authAllowedHosts(config)).toEqual([
      'localhost:3000',
      'console.example',
      'partner.example',
      'localhost:4000',
    ])
  })

  it('uses the configured app origin for a known host, otherwise the public API URL', () => {
    expect(trustedOriginOf(config, 'console.example')).toBe('https://console.example')
    expect(trustedOriginOf(config, 'localhost:3000')).toBe('http://localhost:3000')
    expect(trustedOriginOf(config, 'evil.example')).toBe('http://localhost:4000')
    expect(trustedOriginOf(config, undefined)).toBe('http://localhost:4000')
  })

  it('maps a request URL to the app of its origin; anything else is the workspace', () => {
    expect(appOfUrl(config, 'https://console.example/api/auth/sign-in/email')).toBe('console')
    expect(appOfUrl(config, 'https://partner.example/api/auth/x')).toBe('partner')
    expect(appOfUrl(config, 'http://localhost:3000/api/auth/x')).toBe('workspace')
    expect(appOfUrl(config, 'https://custom.example/api/auth/x')).toBe('workspace')
    expect(appOfUrl(config, undefined)).toBe('workspace')
    expect(appOfUrl(config, 'not a url')).toBe('workspace')
  })
})
