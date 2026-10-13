// SPDX-License-Identifier: AGPL-3.0-only
import { findBuiltInConnectionProvider } from '@surefy/contracts'
import type {
  ConnectionAuthType,
  ConnectionDto,
  ConnectionKind,
  ConnectionScope,
  ConnectionStatus,
  ConnectionStatusReasonCode,
  TeamRefDto,
  UserRefDto,
} from '@surefy/contracts'

import type { ConnectionRow } from './connections.repository.js'

const iso = (date: Date | null): string | null => (date === null ? null : date.toISOString())

/** What a connection row needs from other tables to become the DTO. */
export interface ConnectionRefs {
  teams: ReadonlyMap<string, TeamRefDto>
  users: ReadonlyMap<string, UserRefDto>
  /** Agents, flows, knowledge sources and channels using each connection. */
  usedBy: ReadonlyMap<string, number>
  /** Another person's personal connection never shows its last four characters. */
  viewerUserId: string | null
}

/** The kind decides where the connection's picker appears; bridge providers arrive with V2. */
export const kindOf = (providerKey: string): ConnectionKind =>
  findBuiltInConnectionProvider(providerKey)?.kind ?? 'bridge'

export function toConnectionDto(row: ConnectionRow, refs: ConnectionRefs): ConnectionDto {
  const isOthersPersonal = row.scope === 'personal' && row.ownerUserId !== refs.viewerUserId
  return {
    id: row.id,
    providerKey: row.providerKey,
    kind: kindOf(row.providerKey),
    bridgeId: row.bridgeId,
    authType: row.authType as ConnectionAuthType,
    name: row.name,
    scope: row.scope as ConnectionScope,
    team: row.teamId === null ? null : (refs.teams.get(row.teamId) ?? null),
    owner: row.ownerUserId === null ? null : (refs.users.get(row.ownerUserId) ?? null),
    baseUrl: row.baseUrl,
    secretLast4: isOthersPersonal ? null : row.secretLast4,
    oauthScopes: row.oauthScopes,
    externalAccountLabel: row.externalAccountLabel,
    status: row.status as ConnectionStatus,
    statusReasonCode: row.statusReasonCode as ConnectionStatusReasonCode | null,
    tokenExpiresAt: iso(row.tokenExpiresAt),
    lastRefreshedAt: iso(row.lastRefreshedAt),
    lastUsedAt: iso(row.lastUsedAt),
    usedByCount: refs.usedBy.get(row.id) ?? 0,
    connectedBy:
      row.connectedByUserId === null ? null : (refs.users.get(row.connectedByUserId) ?? null),
    revokedAt: iso(row.revokedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
