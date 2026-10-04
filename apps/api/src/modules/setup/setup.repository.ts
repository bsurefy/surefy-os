// SPDX-License-Identifier: AGPL-3.0-only
import { sql } from 'drizzle-orm'

import { SETUP_LOCK } from './setup.constants.js'

import type { DbExecutor } from '@/core/database/index.js'

/** Setup owns no table: it serializes on an advisory lock and asks `setup_is_complete()`. */
export class SetupRepository {
  /** Serializes `POST /setup` until the transaction ends. */
  async lock(tx: DbExecutor): Promise<void> {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${SETUP_LOCK}))`)
  }

  /** Definer `setup_is_complete`: setup was finished or any organization exists. */
  async isComplete(executor: DbExecutor): Promise<boolean> {
    const result = await executor.execute<{ complete: boolean }>(
      sql`select setup_is_complete() as complete`,
    )
    return result.rows[0]?.complete === true
  }
}
