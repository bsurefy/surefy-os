// SPDX-License-Identifier: AGPL-3.0-only
import { or, eq, type SQL } from 'drizzle-orm'

import { approvals } from '@/database/tables/index.js'
import { PERMISSIONS } from '@surefy/contracts'

import { assignedTo, type Viewer } from './approvals.repository.js'

import type { ApprovalSubjects, ApprovalsContext } from './approvals.types.js'

// Who may see and decide an approval (database/guard-and-approvals.md, §5 "Rules"). Deciding needs
// `approvals:decide`, an assignee row that names the person, and, for AI actions, access to the
// agent or flow. Seeing needs more than assignment only for people without `guard:manage`.

export const viewerOf = (ctx: ApprovalsContext): Viewer => ({
  userId: ctx.userId,
  teamIds: ctx.teamIds,
  role: ctx.role,
})

export const canDecidePermission = (ctx: ApprovalsContext): boolean =>
  ctx.access.permissions.includes(PERMISSIONS.APPROVALS_DECIDE)

/** Guard managers (Admins and Owners) see every approval, read-only when they cannot decide it. */
export const seesEverything = (ctx: ApprovalsContext): boolean =>
  ctx.access.permissions.includes(PERMISSIONS.GUARD_MANAGE)

/**
 * The rows a person sees: everything for Guard managers; otherwise what they can decide, what they
 * requested, and what the agents and flows module opens to them.
 */
export function visibleTo(ctx: ApprovalsContext, subjects: ApprovalSubjects): SQL | undefined {
  if (seesEverything(ctx)) return undefined
  const own = ctx.userId === null ? undefined : eq(approvals.requestedByUserId, ctx.userId)
  return or(assignedTo(viewerOf(ctx)), own, subjects.visibility(ctx) ?? undefined)
}
