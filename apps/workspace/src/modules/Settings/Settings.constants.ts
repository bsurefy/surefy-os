// SPDX-License-Identifier: AGPL-3.0-only
import { SETTINGS_SECTION } from '@/constants/routes'
import { PERMISSIONS } from '@surefy/contracts'

import type { SettingsSectionEntry } from './Settings.types'

/**
 * The settings navigation in display order (navigation.md §6): the MVP sections, each
 * `released: false` until its integration task flips it. Usage & budgets, Branding, Billing and
 * License arrive with their phases.
 */
export const SETTINGS_SECTIONS: readonly SettingsSectionEntry[] = [
  {
    id: 'general',
    section: SETTINGS_SECTION.GENERAL,
    released: false,
    anyPermission: [PERMISSIONS.SETTINGS_MANAGE],
  },
  {
    id: 'members',
    section: SETTINGS_SECTION.MEMBERS,
    released: false,
    anyPermission: [PERMISSIONS.MEMBERS_READ],
  },
  {
    id: 'teams',
    section: SETTINGS_SECTION.TEAMS,
    released: false,
    anyPermission: [PERMISSIONS.TEAMS_READ],
  },
  {
    id: 'access',
    section: SETTINGS_SECTION.ACCESS,
    released: false,
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
    id: 'dataPrivacy',
    section: SETTINGS_SECTION.DATA_PRIVACY,
    released: false,
    anyPermission: [PERMISSIONS.DATA_CONTROL_READ],
  },
  {
    id: 'security',
    section: SETTINGS_SECTION.SECURITY,
    released: false,
    anyPermission: [PERMISSIONS.SETTINGS_MANAGE],
  },
  {
    id: 'install',
    section: SETTINGS_SECTION.INSTALL,
    released: false,
    installAdminOnly: true,
  },
]

/** The sidebar's Settings entry shows for anyone who can open at least one section. */
export const SETTINGS_PERMISSIONS = [
  ...new Set(SETTINGS_SECTIONS.flatMap((entry) => entry.anyPermission ?? [])),
]
