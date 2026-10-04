// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { SCHEMA_GUARD_LISTS } from './schemaGuardLists.js'
import { runSchemaGuards } from './schemaGuards.js'
import { getTestDatabase } from '../helpers/testDatabase.js'

describe('schema guards (freshly migrated database)', () => {
  it('reports no table, function or role that breaks the security conventions', async () => {
    const { owner } = getTestDatabase()
    expect(await runSchemaGuards(owner.global, SCHEMA_GUARD_LISTS)).toEqual([])
  })
})
