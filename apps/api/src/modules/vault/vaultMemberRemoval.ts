// SPDX-License-Identifier: AGPL-3.0-only
import { VAULT_AUDIT_ACTIONS } from '@surefy/contracts'

import type { VaultRepository } from './vault.repository.js'
import type { AuditRecorder } from '@/modules/audit/index.js'
import type { MemberRemovalStep } from '@/modules/members/index.js'

/**
 * Removing a member revokes their personal keys in the removal transaction (vault-and-models.md,
 * §2): the secrets are deleted at once, each revocation audited.
 */
export function createVaultMemberRemoval(deps: {
  repository: VaultRepository
  audit: AuditRecorder
}): MemberRemovalStep {
  return {
    async onRemoveInTx(tx, ctx, removedUserId) {
      const revoked = await deps.repository.revokePersonalKeys(
        tx,
        ctx.orgId,
        removedUserId,
        ctx.userId,
      )
      for (const key of revoked) {
        await deps.audit.record(tx, ctx, {
          action: VAULT_AUDIT_ACTIONS.VAULT_KEY_REVOKED,
          target: { type: 'vault_credential', id: key.id },
          metadata: {
            labels: { providerKey: key.providerKey, scope: 'personal', reason: 'member_removed' },
          },
        })
      }
    },
  }
}
