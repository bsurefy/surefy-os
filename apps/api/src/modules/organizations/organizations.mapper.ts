// SPDX-License-Identifier: AGPL-3.0-only
import {
  organizationSettingsSchema,
  type OrganizationDto,
  type OrganizationRefDto,
  type OrganizationSettings,
  type UpdateOrganizationSettingsInput,
} from '@surefy/contracts'

import type { OrganizationRow } from './organizations.repository.js'

type StoredSettings = OrganizationRow['settings']

/** The stored settings are sparse; the contract fills in every default. */
export const readSettings = (stored: StoredSettings): OrganizationSettings =>
  organizationSettingsSchema.parse(stored)

const definedOnly = <T extends object>(value: T): Partial<T> =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>

/** Applies a sparse PATCH section by section; only the fields it names change. */
export function mergeSettings(
  stored: StoredSettings,
  patch: UpdateOrganizationSettingsInput,
): StoredSettings {
  const merged: StoredSettings = { ...stored, version: 1 }
  if (patch.security !== undefined) {
    merged.security = { ...stored.security, ...definedOnly(patch.security) }
  }
  if (patch.privacy !== undefined) {
    merged.privacy = { ...stored.privacy, ...definedOnly(patch.privacy) }
  }
  if (patch.setup !== undefined) merged.setup = { ...stored.setup, ...definedOnly(patch.setup) }
  return merged
}

export function toOrganizationDto(row: OrganizationRow, logoUrl: string | null): OrganizationDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logoUrl,
    timezone: row.timezone,
    defaultLocale: row.defaultLocale,
    currency: row.currency,
    status: row.status,
    suspendedAt: row.suspendedAt?.toISOString() ?? null,
    deletionRequestedAt: row.deletionRequestedAt?.toISOString() ?? null,
    deletionScheduledFor: row.deletionScheduledFor?.toISOString() ?? null,
    settings: readSettings(row.settings),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toOrganizationRefDto(
  row: Pick<OrganizationRow, 'id' | 'name' | 'slug' | 'status'>,
  logoUrl: string | null,
): OrganizationRefDto {
  return { id: row.id, name: row.name, slug: row.slug, logoUrl, status: row.status }
}
