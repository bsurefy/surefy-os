// SPDX-License-Identifier: AGPL-3.0-only
import { PERMISSIONS } from '@surefy/contracts'

import { usableBy } from './connections.repository.js'

import type { ConnectionRow } from './connections.repository.js'
import type { ConnectionPrincipal, ConnectionsContext } from './connections.types.js'

// Who may do what with a connection (design/workspace/connections.md, §8). Adding a team or
// organization connection, and changing anyone's, needs `connections:manage`; a Builder adds and
// changes their own personal connections. Using one follows its scope.

export const canManage = (ctx: Pick<ConnectionsContext, 'access'>): boolean =>
  ctx.access.permissions.includes(PERMISSIONS.CONNECTIONS_MANAGE)

export const principalOf = (ctx: ConnectionsContext): ConnectionPrincipal => ({
  userId: ctx.userId,
  teamIds: ctx.teamIds,
})

/** A person's own connection: personal, and theirs. */
export const isOwnPersonal = (ctx: ConnectionsContext, row: ConnectionRow): boolean =>
  row.scope === 'personal' && ctx.userId !== null && row.ownerUserId === ctx.userId

/** Reconnect, rename, edit the address, test and disconnect. */
export const canChange = (ctx: ConnectionsContext, row: ConnectionRow): boolean =>
  canManage(ctx) || isOwnPersonal(ctx, row)

/** Whether a connection may be used by this person (runtime and save-time rule). */
export function isUsableBy(principal: ConnectionPrincipal, row: ConnectionRow): boolean {
  if (row.scope === 'organization') return true
  if (row.scope === 'personal')
    return principal.userId !== null && row.ownerUserId === principal.userId
  return row.teamId !== null && principal.teamIds.includes(row.teamId)
}

/** Whether the connection shows up for this person at all, in the list or when opened. */
export function canSee(ctx: ConnectionsContext, row: ConnectionRow): boolean {
  if (canManage(ctx)) return true
  if (
    ctx.userId !== null &&
    (row.ownerUserId === ctx.userId || row.connectedByUserId === ctx.userId)
  ) {
    return true
  }
  return isUsableBy(principalOf(ctx), row)
}

export { usableBy }
