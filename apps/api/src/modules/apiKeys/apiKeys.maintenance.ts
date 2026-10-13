// SPDX-License-Identifier: AGPL-3.0-only
import { CLEANUP_BATCH, REVOKED_KEEP_MONTHS, SYSTEM_REASON } from './apiKeys.constants.js'

import type { ApiKeysRepository } from './apiKeys.repository.js'
import type { Database } from '@/core/database/index.js'

export interface ApiKeysMaintenanceDeps {
  db: Database
  repository: ApiKeysRepository
  now?: () => Date
}

/** Retention of revoked keys (`api_keys`: revoked rows are deleted 13 months after `revoked_at`). */
export class ApiKeysMaintenance {
  constructor(private readonly deps: ApiKeysMaintenanceDeps) {}

  /** Deletes in batches, each its own transaction; returns how many rows went. */
  async deleteExpiredRevoked(): Promise<number> {
    const before = this.deps.now?.() ?? new Date()
    before.setUTCMonth(before.getUTCMonth() - REVOKED_KEEP_MONTHS)
    let total = 0
    for (;;) {
      const deleted = await this.deps.db.system(SYSTEM_REASON, (tx) =>
        this.deps.repository.deleteRevokedBefore(tx, before, CLEANUP_BATCH),
      )
      total += deleted
      if (deleted < CLEANUP_BATCH) return total
    }
  }
}
