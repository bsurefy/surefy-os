// SPDX-License-Identifier: AGPL-3.0-only
import type { ApprovalsService } from './approvals.service.js'
import type { MemberRemovalStep } from '@/modules/members/index.js'
import type { TeamDeletionStep } from '@/modules/teams/teams.types.js'

/**
 * Removing a member must not leave an approval without anyone who can decide it: role `admin` is
 * added to such approvals in the removal transaction, before the member goes.
 */
export const createApprovalsMemberRemoval = (service: ApprovalsService): MemberRemovalStep => ({
  async onRemoveInTx(tx, ctx, removedUserId) {
    await service.reassignWithoutAssignees(tx, ctx.orgId, { userId: removedUserId })
  },
})

/** Deleting a team does the same for approvals that only the team could decide. */
export const createApprovalsTeamDeletion = (service: ApprovalsService): TeamDeletionStep => ({
  async onDeleteInTx(tx, orgId, teamId) {
    await service.reassignWithoutAssignees(tx, orgId, { teamId })
  },
})
