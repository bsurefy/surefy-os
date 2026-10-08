// SPDX-License-Identifier: AGPL-3.0-only
import { CONNECTION_AUDIT_ACTIONS } from '@surefy/contracts'

import type { ConnectionsRepository } from './connections.repository.js'
import type { AuditRecorder } from '@/modules/audit/index.js'
import type { MemberRemovalStep } from '@/modules/members/index.js'

/**
 * Removing a member disconnects their personal connections in the removal transaction (like
 * personal Vault keys): the secrets are gone at once, each disconnect audited. The apps' own
 * grants are not revoked here, because the removal transaction must not call out; they can be
 * removed at the app.
 */
export function createConnectionsMemberRemoval(deps: {
  repository: ConnectionsRepository
  audit: AuditRecorder
}): MemberRemovalStep {
  return {
    async onRemoveInTx(tx, ctx, removedUserId) {
      const revoked = await deps.repository.revokePersonalOf(
        tx,
        ctx.orgId,
        removedUserId,
        ctx.userId,
      )
      for (const connection of revoked) {
        await deps.audit.record(tx, ctx, {
          action: CONNECTION_AUDIT_ACTIONS.CONNECTION_REVOKED,
          target: { type: 'connection', id: connection.id },
          metadata: {
            labels: {
              providerKey: connection.providerKey,
              scope: 'personal',
              reason: 'member_removed',
            },
          },
        })
      }
    },
  }
}
