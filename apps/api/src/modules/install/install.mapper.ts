// SPDX-License-Identifier: AGPL-3.0-only
import {
  OAUTH_PROVIDERS,
  type InstallAdminDto,
  type InstallOrganizationDto,
  type InstallSettingsDto,
  type OrganizationStatus,
  type UserRefDto,
} from '@surefy/contracts'

import type { InstallAdminRow, InstallOrganizationRow } from './install.repository.js'
import type { ResolvedInstallSettings } from './installSettings/installSettings.service.js'
import type { Config } from '@/core/config/index.js'

export interface InstallSettingsDtoContext {
  config: Config
  version: string
  organizations: { count: number; max: number | null }
}

/** `GET /install/settings`: the row and its settings; the SMTP password only as `passwordSet`. */
export function toInstallSettingsDto(
  { row, settings }: ResolvedInstallSettings,
  context: InstallSettingsDtoContext,
): InstallSettingsDto {
  const { oauth } = context.config.auth
  return {
    installationId: row.installationId,
    version: { current: context.version, latest: null },
    setupCompletedAt: row.setupCompletedAt?.toISOString() ?? null,
    signupPolicy: row.signupPolicy,
    orgCreationPolicy: row.orgCreationPolicy,
    organizations: context.organizations,
    signIn: {
      emailPassword: settings.signIn.emailPassword,
      oauth: Object.fromEntries(
        OAUTH_PROVIDERS.map((provider) => [
          provider,
          { enabled: settings.signIn.oauth[provider], configured: oauth[provider] !== undefined },
        ]),
      ) as InstallSettingsDto['signIn']['oauth'],
    },
    smtp:
      settings.smtp === null
        ? null
        : { ...settings.smtp, passwordSet: row.smtpPasswordCiphertext !== null },
    webSearch: { searxngUrl: settings.webSearch.searxngUrl },
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toInstallAdminDto(row: InstallAdminRow, user: UserRefDto): InstallAdminDto {
  return {
    user,
    grantedByUserId: row.grantedByUserId,
    createdAt: row.createdAt.toISOString(),
  }
}

export function toInstallOrganizationDto(
  row: InstallOrganizationRow,
  logoUrl: string | null,
): InstallOrganizationDto {
  return {
    id: row.organizationId,
    name: row.name,
    slug: row.slug,
    logoUrl,
    status: row.status as OrganizationStatus,
    memberCount: row.activeMemberCount,
    createdAt: row.createdAt,
  }
}
