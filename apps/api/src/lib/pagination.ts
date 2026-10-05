// SPDX-License-Identifier: AGPL-3.0-only
import { asc, desc, sql, type AnyColumn, type SQL } from 'drizzle-orm'
import { z } from 'zod'

import { BadRequestError } from '@/core/errors/index.js'

// Keyset pagination (repositories.md, §4): fetch `limit + 1` rows, order by a unique key, and hand
// the client an opaque base64url JSON cursor it never builds itself.

/**
 * The position after the last row of a page: the row's sort value as Postgres renders it as text
 * (exact, microseconds included) and its id, which breaks ties.
 */
export const keysetCursorSchema = z.object({ k: z.string(), id: z.uuid() })
export type KeysetCursor = z.infer<typeof keysetCursorSchema>

export function encodeCursor(cursor: KeysetCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url')
}

/** `400 BAD_REQUEST` for a cursor the API did not issue. */
export function decodeCursor(cursor: string): KeysetCursor {
  try {
    return keysetCursorSchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')))
  } catch {
    throw new BadRequestError(undefined, 'Invalid cursor')
  }
}

/** Splits the `limit + 1` rows of a keyset query into the page and the next cursor. */
export function toPage<Row>(
  rows: readonly Row[],
  limit: number,
  cursorOf: (row: Row) => KeysetCursor,
): { items: Row[]; nextCursor: string | null } {
  const items = rows.slice(0, limit)
  const last = items.at(-1)
  const nextCursor = rows.length > limit && last !== undefined ? encodeCursor(cursorOf(last)) : null
  return { items, nextCursor }
}

/** `?sort=-createdAt` → `{ field: 'createdAt', descending: true }`. */
export function parseSort<Field extends string>(
  sort: string | undefined,
  fallback: `${'-' | ''}${Field}`,
): { field: Field; descending: boolean } {
  const value = sort ?? fallback
  const descending = value.startsWith('-')
  return { field: (descending ? value.slice(1) : value) as Field, descending }
}

/** A sort key: the expression, how its text form casts back, and the direction. */
export interface KeysetSort {
  expression: SQL | AnyColumn
  cast: 'timestamptz' | 'text' | 'bigint'
  descending: boolean
}

/** The page's `where` condition: rows strictly after the cursor in `(sort, id)` order. */
export function keysetAfter(
  sort: KeysetSort,
  id: AnyColumn,
  cursor: KeysetCursor | undefined,
): SQL | undefined {
  if (cursor === undefined) return undefined
  const value = sql`${cursor.k}::${sql.raw(sort.cast)}`
  return sort.descending
    ? sql`(${sort.expression}, ${id}) < (${value}, ${cursor.id}::uuid)`
    : sql`(${sort.expression}, ${id}) > (${value}, ${cursor.id}::uuid)`
}

/** `order by sort, id` in the page's direction. */
export function keysetOrder(sort: KeysetSort, id: AnyColumn): SQL[] {
  const direction = sort.descending ? desc : asc
  return [direction(sort.expression), direction(id)]
}

/** The sort value as text, selected next to the row so the cursor round-trips exactly. */
export const keysetKey = (sort: KeysetSort): SQL<string> => sql<string>`(${sort.expression})::text`
