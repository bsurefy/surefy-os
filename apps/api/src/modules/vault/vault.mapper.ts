// SPDX-License-Identifier: AGPL-3.0-only
import type {
  ConnectionFailureCode,
  CredentialDto,
  CredentialKind,
  CredentialScope,
  CredentialSpendDto,
  CredentialStatus,
  ModelAccessRuleDto,
  ModelAccessSubjectType,
  ModelType,
  TeamRefDto,
  UserRefDto,
  VaultModelDto,
  VaultModelSource,
  VaultModelStatus,
} from '@surefy/contracts'

import type { ModelAccessRuleRow, VaultModelRow } from './models.repository.js'
import type { CredentialRow } from './vault.repository.js'

const iso = (date: Date | null): string | null => (date === null ? null : date.toISOString())

/** What a credential row needs from other tables to become the keys table's row. */
export interface CredentialRefs {
  teams: ReadonlyMap<string, TeamRefDto>
  users: ReadonlyMap<string, UserRefDto>
  replacements: ReadonlyMap<string, { id: string; name: string }>
  spend: ReadonlyMap<string, CredentialSpendDto[]>
  modelCounts: ReadonlyMap<string, number>
  /** Another person's personal key never shows its last four characters. */
  viewerUserId: string | null
}

export function toCredentialDto(row: CredentialRow, refs: CredentialRefs): CredentialDto {
  const isOthersPersonal = row.scope === 'personal' && row.ownerUserId !== refs.viewerUserId
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as CredentialKind,
    providerKey: row.providerKey,
    scope: row.scope as CredentialScope,
    team: row.teamId === null ? null : (refs.teams.get(row.teamId) ?? null),
    owner: row.ownerUserId === null ? null : (refs.users.get(row.ownerUserId) ?? null),
    isPrimary: row.isPrimary,
    baseUrl: row.baseUrl,
    secretLast4: isOthersPersonal ? null : row.secretLast4,
    status: row.status as CredentialStatus,
    statusReasonCode: row.statusReasonCode as ConnectionFailureCode | null,
    statusCheckedAt: iso(row.statusCheckedAt),
    lastSuccessAt: iso(row.lastSuccessAt),
    expiresAt: iso(row.expiresAt),
    lastUsedAt: iso(row.lastUsedAt),
    rotatedFromId: row.rotatedFromId,
    replacedBy: refs.replacements.get(row.id) ?? null,
    createdBy: row.createdByUserId === null ? null : (refs.users.get(row.createdByUserId) ?? null),
    revokedAt: iso(row.revokedAt),
    spendThisMonth: refs.spend.get(row.id) ?? [],
    modelCount: row.kind === 'local_server' ? (refs.modelCounts.get(row.id) ?? 0) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toVaultModelDto(row: VaultModelRow, serverName: string | null): VaultModelDto {
  return {
    id: row.id,
    modelKey: row.modelKey,
    providerKey: row.providerKey,
    providerModelId: row.providerModelId,
    displayName: row.displayName,
    type: row.type as ModelType,
    source: row.source as VaultModelSource,
    server:
      row.credentialId === null || serverName === null
        ? null
        : { id: row.credentialId, name: serverName },
    supportsVision: row.supportsVision,
    supportsTools: row.supportsTools,
    contextWindow: row.contextWindow,
    embeddingDimensions: row.embeddingDimensions,
    prices: {
      inputPerMTokMicros: row.inputPricePerMtokMicros,
      outputPerMTokMicros: row.outputPricePerMtokMicros,
      cachedInputPerMTokMicros: row.cachedInputPricePerMtokMicros,
      currency: row.currency,
    },
    isEnabled: row.isEnabled,
    status: row.status as VaultModelStatus,
    lastSeenAt: iso(row.lastSeenAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toRuleDto(
  row: ModelAccessRuleRow,
  teams: ReadonlyMap<string, TeamRefDto>,
  users: ReadonlyMap<string, UserRefDto>,
): ModelAccessRuleDto {
  return {
    id: row.id,
    subjectType: row.subjectType as ModelAccessSubjectType,
    team: row.teamId === null ? null : (teams.get(row.teamId) ?? null),
    user: row.userId === null ? null : (users.get(row.userId) ?? null),
    createdAt: row.createdAt.toISOString(),
  }
}
