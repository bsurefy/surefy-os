// SPDX-License-Identifier: AGPL-3.0-only
import type { ConnectionImpactDto, Permission, TeamRefDto, UserRefDto } from '@surefy/contracts'

import type { DbExecutor } from '@/core/database/index.js'
import type { NotifyInput } from '@/modules/notifications/notifications.types.js'
import type { OutboxEventInput } from '@/modules/outbox/index.js'
import type { ActorContext } from '@/types/context.js'

/** What the service needs from the request: the verified organization, who acts and what they may do. */
export interface ConnectionsContext {
  orgId: string
  userId: string | null
  via?: ActorContext['via']
  requestId?: string
  ip?: string
  userAgent?: string
  apiKey?: { id: string }
  grantId?: string
  teamIds: readonly string[]
  access: { permissions: readonly Permission[] }
}

/** The person whose access decides whether a connection may be used (an agent runs as its builder). */
export interface ConnectionPrincipal {
  userId: string | null
  teamIds: readonly string[]
}

/** Team names (teams module). */
export interface ConnectionsTeams {
  findRefsInTx(tx: DbExecutor, orgId: string, teamIds: readonly string[]): Promise<TeamRefDto[]>
}

/** People's display data (auth module). */
export interface ConnectionsUserRefs {
  findUserRefs(userIds: readonly string[]): Promise<ReadonlyMap<string, UserRefDto>>
}

/** Writes in-app notifications (notifications module). */
export interface ConnectionsNotifier {
  notify(ctx: { orgId: string }, input: NotifyInput): Promise<unknown>
}

/** Writes an outbox event in the caller's transaction (outbox module). */
export interface ConnectionsOutbox {
  write(tx: DbExecutor, event: OutboxEventInput<'connection.expired'>): Promise<boolean>
}

/**
 * What depends on a connection (`dependency_edges`): agents and their tools, channels, flows and
 * knowledge sources. Those modules provide it as they land; until then nothing depends on one.
 */
export interface ConnectionDependents {
  counts(
    tx: DbExecutor,
    orgId: string,
    connectionIds: readonly string[],
  ): Promise<ReadonlyMap<string, number>>
  impact(tx: DbExecutor, orgId: string, connectionId: string): Promise<ConnectionImpactDto>
}

export const NO_DEPENDENTS: ConnectionDependents = {
  counts: () => Promise.resolve(new Map()),
  impact: () => Promise.resolve({ dependents: [], listed: [] }),
}
