// SPDX-License-Identifier: AGPL-3.0-only
import { PERMISSIONS } from '@surefy/contracts'

import type { Viewer } from './agents.repository.js'
import type { AgentsContext } from './agents.types.js'

// Who may see, edit and delete an agent (database/agents-and-runs.md, §3 "Rules"; design/workspace
// agents.md, §4). The route checks the permission; these decide per agent. Seeing is owning the
// agent, holding `agents:manage-all`, or a matching audience row; `edit` rows allow editing.

export const hasPermission = (
  ctx: Pick<AgentsContext, 'access'>,
  permission: (typeof PERMISSIONS)[keyof typeof PERMISSIONS],
): boolean => ctx.access.permissions.includes(permission)

export const viewerOf = (ctx: AgentsContext): Viewer => ({
  userId: ctx.userId,
  teamIds: ctx.teamIds,
  all: hasPermission(ctx, PERMISSIONS.AGENTS_MANAGE_ALL),
})

/** Delete: own agents, or any with `agents:manage-all`. */
export function canDelete(ctx: AgentsContext, ownerUserId: string | null): boolean {
  if (!hasPermission(ctx, PERMISSIONS.AGENTS_DELETE)) return false
  return (
    hasPermission(ctx, PERMISSIONS.AGENTS_MANAGE_ALL) ||
    (ctx.userId !== null && ctx.userId === ownerUserId)
  )
}
