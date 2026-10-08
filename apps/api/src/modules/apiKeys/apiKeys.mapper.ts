// SPDX-License-Identifier: AGPL-3.0-only
import type { ApiKeyDto, UserRefDto } from '@surefy/contracts'

import { isExpired } from './apiKeys.utils.js'

import type { ApiKeyRow } from './apiKeys.repository.js'

/** `lastUsedAt` is buffered, so it can lag by a few minutes. */
export function toApiKeyDto(
  row: ApiKeyRow,
  refs: ReadonlyMap<string, UserRefDto>,
  now: Date,
): ApiKeyDto {
  const ref = (userId: string | null) => (userId === null ? null : (refs.get(userId) ?? null))
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.keyPrefix,
    scopes: row.scopes,
    status: row.status as ApiKeyDto['status'],
    expiresAt: row.expiresAt?.toISOString() ?? null,
    isExpired: isExpired(row.expiresAt, now),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    lastUsedIp: row.lastUsedIp,
    createdBy: ref(row.createdByUserId),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    revokedBy: ref(row.revokedByUserId),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
