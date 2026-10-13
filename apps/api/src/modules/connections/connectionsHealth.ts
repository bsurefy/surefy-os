// SPDX-License-Identifier: AGPL-3.0-only
import { CONNECTION_AUDIT_ACTIONS, CONNECTIONS_ERROR_CODES } from '@surefy/contracts'
import type { ConnectionStatusReasonCode } from '@surefy/contracts'

import type { ConnectionRow, ConnectionsRepository } from './connections.repository.js'
import type { ConnectionsOutbox } from './connections.types.js'
import type { DbExecutor } from '@/core/database/index.js'
import type { AuditContext, AuditRecorder } from '@/modules/audit/index.js'

/** The result of trying a connection: it works, or the reason it does not. */
export type HealthOutcome = { ok: true } | { ok: false; reasonCode: ConnectionStatusReasonCode }

const EXPIRED_REASONS: readonly ConnectionStatusReasonCode[] = [
  CONNECTIONS_ERROR_CODES.CONNECTION_TOKEN_EXPIRED,
  CONNECTIONS_ERROR_CODES.CONNECTION_REFRESH_FAILED,
]

/**
 * The status machine (database/bridge-and-connections.md, §1): `active → expired` (token past
 * expiry and refresh failed, or the app reports the grant revoked), `active → error` (the app
 * rejects calls for another reason), `expired | error → active` (a check or refresh passes).
 * The transaction that sets `expired` writes the outbox event, so nothing fails silently.
 */
export class ConnectionHealth {
  constructor(
    private readonly deps: {
      repository: ConnectionsRepository
      audit: AuditRecorder
      outbox: ConnectionsOutbox
    },
  ) {}

  /** Applies a check's outcome to a stored connection. */
  async record(
    tx: DbExecutor,
    ctx: AuditContext,
    row: ConnectionRow,
    outcome: HealthOutcome,
  ): Promise<ConnectionRow> {
    if (outcome.ok) {
      if (row.status === 'active') return row
      return (
        (await this.deps.repository.setStatus(tx, row.organizationId, row.id, 'active', null)) ??
        row
      )
    }
    if (EXPIRED_REASONS.includes(outcome.reasonCode)) {
      return this.expire(tx, ctx, row, outcome.reasonCode)
    }
    if (row.status === 'error' && row.statusReasonCode === outcome.reasonCode) return row
    return (
      (await this.deps.repository.setStatus(
        tx,
        row.organizationId,
        row.id,
        'error',
        outcome.reasonCode,
      )) ?? row
    )
  }

  /** `expired`, with the audit entry and the outbox event the first time. */
  async expire(
    tx: DbExecutor,
    ctx: AuditContext,
    row: ConnectionRow,
    reasonCode: ConnectionStatusReasonCode,
  ): Promise<ConnectionRow> {
    const updated = await this.deps.repository.setStatus(
      tx,
      row.organizationId,
      row.id,
      'expired',
      reasonCode,
    )
    if (updated === undefined) return row
    if (row.status !== 'expired') {
      await this.deps.outbox.write(tx, {
        orgId: row.organizationId,
        topic: 'connection.expired',
        payload: { version: 1, id: row.id },
      })
      await this.deps.audit.record(tx, ctx, {
        action: CONNECTION_AUDIT_ACTIONS.CONNECTION_EXPIRED,
        target: { type: 'connection', id: row.id },
        metadata: {
          labels: { providerKey: row.providerKey, scope: row.scope },
          codes: [reasonCode],
          changes: [{ field: 'status', from: row.status, to: 'expired' }],
        },
      })
    }
    return updated
  }
}
