// SPDX-License-Identifier: AGPL-3.0-only
import {
  CLEANUP_BATCH,
  REFRESH_BATCH,
  REFRESH_WINDOW_MS,
  REVOKED_KEEP_MONTHS,
  SYSTEM_REASON,
} from './connections.constants.js'

import type { ConnectionsRepository } from './connections.repository.js'
import type { ConnectionTokens } from './connectionsTokens.js'
import type { Database } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'

export interface ConnectionsMaintenanceDeps {
  db: Database
  repository: ConnectionsRepository
  tokens: ConnectionTokens
  logger: Logger
  now?: () => Date
}

export interface RefreshRun {
  due: number
  refreshed: number
  expired: number
  failed: number
}

/** The recurring work of connections (database/bridge-and-connections.md, §1 "Refresh" and "Retention"). */
export class ConnectionsMaintenance {
  constructor(private readonly deps: ConnectionsMaintenanceDeps) {}

  /**
   * `connections-refresh`: lists OAuth 2 connections expiring within 15 minutes under system
   * scope, then renews each in its own organization's transaction. One connection's failure
   * never stops the others; the next run (10 minutes later) takes what is left.
   */
  async refreshDue(): Promise<RefreshRun> {
    const now = this.deps.now?.() ?? new Date()
    const due = await this.deps.db.system(SYSTEM_REASON, (tx) =>
      this.deps.repository.dueForRefresh(
        tx,
        new Date(now.getTime() + REFRESH_WINDOW_MS),
        REFRESH_BATCH,
      ),
    )
    const run: RefreshRun = { due: due.length, refreshed: 0, expired: 0, failed: 0 }
    for (const connection of due) {
      try {
        const result = await this.deps.tokens.refresh(connection.organizationId, connection.id, {
          orgId: connection.organizationId,
          userId: null,
          via: 'system',
          requestId: 'connections-refresh',
        })
        if (result === 'refreshed') run.refreshed += 1
        if (result === 'expired') run.expired += 1
      } catch (error) {
        run.failed += 1
        this.deps.logger.error(
          { err: error, orgId: connection.organizationId, connectionId: connection.id },
          'connection refresh failed',
        )
      }
    }
    return run
  }

  /** Disconnected connections stay 13 months, then the row goes (its audit entries stay). */
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
