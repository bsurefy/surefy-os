// SPDX-License-Identifier: AGPL-3.0-only
import { afterAll, afterEach, beforeAll, inject } from 'vitest'

import { runFileTeardowns } from '../helpers/cleanup.js'
import { closeTestDatabase, getTestDatabase, openTestDatabase } from '../helpers/testDatabase.js'

/**
 * Runs in every integration test file (vitest `setupFiles`): a fresh database cloned from the
 * migrated template before the file, empty tables between tests, everything dropped after.
 */
beforeAll(async () => {
  await openTestDatabase(inject('infrastructure'))
})

afterEach(async () => {
  await getTestDatabase().reset()
})

afterAll(async () => {
  try {
    await runFileTeardowns()
  } finally {
    await closeTestDatabase()
  }
})
