// SPDX-License-Identifier: AGPL-3.0-only
import type { SessionDto, UserDto, UserPreferencesDto } from '@surefy/contracts'

import type { SessionRow, UserPreferencesRow } from './auth.repository.js'
import type { UserRow } from './authUsers/authUsers.repository.js'

export function toUserDto(row: UserRow, imageUrl: string | null): UserDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.emailVerified,
    imageUrl,
    twoFactorEnabled: row.twoFactorEnabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * A missing row means every default. A last organization the person no longer actively belongs
 * to is ignored, so they see "Choose organization" or "No organization" instead.
 */
export function toUserPreferencesDto(
  row: UserPreferencesRow | undefined,
  activeOrganizationIds: ReadonlySet<string>,
): UserPreferencesDto {
  const last = row?.lastOrganizationId ?? null
  return {
    locale: row?.locale ?? null,
    theme: row?.theme ?? 'system',
    timezone: row?.timezone ?? null,
    lastOrganizationId: last !== null && activeOrganizationIds.has(last) ? last : null,
  }
}

export function toSessionDto(row: SessionRow, currentSessionId: string): SessionDto {
  return {
    id: row.id,
    app: row.app,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    isCurrent: row.id === currentSessionId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  }
}
