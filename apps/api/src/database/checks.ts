// SPDX-License-Identifier: AGPL-3.0-only
import { sql } from 'drizzle-orm'
import { type AnyPgColumn, check } from 'drizzle-orm/pg-core'

const SAFE_VALUE = /^[a-z0-9_-]+$/

/**
 * `text` + CHECK (column in (...)). Values are constants from @surefy/contracts, never input;
 * the pattern check keeps a stray quote out of the generated SQL. Name: `<table>_<column>_check`.
 */
export const enumCheck = (name: string, column: AnyPgColumn, values: readonly string[]) => {
  for (const value of values) {
    if (!SAFE_VALUE.test(value)) throw new Error(`unsafe enum value ${value}`)
  }
  const list = values.map((value) => `'${value}'`).join(', ')
  return check(name, sql`${column} in (${sql.raw(list)})`)
}

/** Emails, slugs and hosts are stored lowercase. Name: `<table>_<column>_lower_check`. */
export const lowercaseCheck = (name: string, column: AnyPgColumn) =>
  check(name, sql`${column} = lower(${column})`)
