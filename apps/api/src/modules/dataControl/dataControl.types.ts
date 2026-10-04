// SPDX-License-Identifier: AGPL-3.0-only
import type { UserRefDto } from '@surefy/contracts'

import type { DbExecutor } from '@/core/database/index.js'
import type { AuditContext } from '@/modules/audit/index.js'
import type { NotifyInput } from '@/modules/notifications/index.js'
import type { ActorSession, EffectiveAccess } from '@/types/context.js'

/** What the service needs from the request: the organization, who acts, their access, the session. */
export interface DataControlContext extends AuditContext {
  access: Pick<EffectiveAccess, 'permissions' | 'features'>
  session?: Pick<ActorSession, 'createdAt'>
}

/** The organizations module's deletion hold, in the caller's transaction. */
export interface DataControlOrganizations {
  scheduleDeletionInTx(
    tx: DbExecutor,
    orgId: string,
    input: { requestedByUserId: string | null; scheduledFor: Date },
  ): Promise<boolean>
  cancelDeletionInTx(tx: DbExecutor, orgId: string): Promise<boolean>
}

/** In-app notifications (and their emails) after a change commits. */
export interface DataControlNotifications {
  notify(ctx: { orgId: string }, input: NotifyInput): Promise<unknown>
}

/** People: names for the lists, the two-factor flag for deletion. */
export interface DataControlUsers {
  findUserRefs(userIds: readonly string[]): Promise<ReadonlyMap<string, UserRefDto>>
  findById(userId: string): Promise<{ twoFactorEnabled: boolean } | undefined>
}

/** A person's current effective access, re-checked when an export is prepared. */
export interface DataControlAccess {
  forMember(orgId: string, userId: string): Promise<EffectiveAccess | null>
}
