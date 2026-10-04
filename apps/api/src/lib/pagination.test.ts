// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { decodeCursor, encodeCursor, parseSort, toPage } from './pagination.js'

const id = '0199b2c4-0000-7000-8000-00000000000a'

describe('keyset pagination', () => {
  it('round-trips a cursor and refuses one the API did not issue', () => {
    const cursor = { k: '2026-10-04 10:00:00.123456+00', id }
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor)
    expect(() => decodeCursor('not-a-cursor')).toThrow('Invalid cursor')
  })

  it('splits limit + 1 rows into a page and the next cursor', () => {
    const rows = [1, 2, 3].map((n) => ({ n, id }))
    expect(toPage(rows, 2, (row) => ({ k: String(row.n), id: row.id }))).toEqual({
      items: rows.slice(0, 2),
      nextCursor: encodeCursor({ k: '2', id }),
    })
    expect(toPage(rows, 3, (row) => ({ k: String(row.n), id: row.id })).nextCursor).toBeNull()
  })

  it('reads ?sort= with its direction and falls back to the default', () => {
    expect(parseSort<'name' | 'createdAt'>('-name', 'createdAt')).toEqual({
      field: 'name',
      descending: true,
    })
    expect(parseSort<'name' | 'createdAt'>(undefined, '-createdAt')).toEqual({
      field: 'createdAt',
      descending: true,
    })
  })
})
