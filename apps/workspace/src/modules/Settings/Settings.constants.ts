// SPDX-License-Identifier: AGPL-3.0-only
import { SETTINGS_SECTION } from '@/constants/routes'
import { PERMISSIONS } from '@surefy/contracts'

import type { SettingsSectionEntry } from './Settings.types'

/**
 * The settings navigation in display order (navigation.md §6): each section is released once
 * its integration task has flipped it. Branding, Billing and License arrive with their phases.
 */
export const SETTINGS_SECTIONS: readonly SettingsSectionEntry[] = [
  {
    id: 'general',
    section: SETTINGS_SECTION.GENERAL,
    released: true,
    anyPermission: [PERMISSIONS.SETTINGS_MANAGE],
  },
  {
    id: 'members',
    section: SETTINGS_SECTION.MEMBERS,
    released: true,
    anyPermission: [PERMISSIONS.MEMBERS_READ],
  },
  {
    id: 'teams',
    section: SETTINGS_SECTION.TEAMS,
    released: true,
    anyPermission: [PERMISSIONS.TEAMS_READ],
  },
  {
    id: 'access',
    section: SETTINGS_SECTION.ACCESS,
    released: true,
    anyPermission: [PERMISSIONS.ACCESS_READ],
  },
  {
    id: 'vault',
    section: SETTINGS_SECTION.VAULT,
    released: true,
    // Builders see the read-only list of the models they may use
    anyPermission: [PERMISSIONS.VAULT_READ],
  },
  {
    id: 'connections',
    section: SETTINGS_SECTION.CONNECTIONS,
    released: true,
    // Builders see and manage their own personal connections
    anyPermission: [PERMISSIONS.CONNECTIONS_USE],
  },
  {
    id: 'apiKeys',
    section: SETTINGS_SECTION.API_KEYS,
    released: true,
    anyPermission: [PERMISSIONS.API_KEYS_MANAGE],
  },
  {
    id: 'usage',
    section: SETTINGS_SECTION.USAGE,
    released: true,
    anyPermission: [PERMISSIONS.INSIGHTS_READ],
  },
  {
    id: 'dataPrivacy',
    section: SETTINGS_SECTION.DATA_PRIVACY,
    released: true,
    anyPermission: [PERMISSIONS.DATA_CONTROL_READ],
  },
  {
    id: 'security',
    section: SETTINGS_SECTION.SECURITY,
    released: true,
    anyPermission: [PERMISSIONS.SETTINGS_MANAGE],
  },
  {
    id: 'install',
    section: SETTINGS_SECTION.INSTALL,
    released: true,
    installAdminOnly: true,
  },
]

/** The sidebar's Settings entry shows for anyone who can open at least one section. */
export const SETTINGS_PERMISSIONS = [
  ...new Set(SETTINGS_SECTIONS.flatMap((entry) => entry.anyPermission ?? [])),
]
