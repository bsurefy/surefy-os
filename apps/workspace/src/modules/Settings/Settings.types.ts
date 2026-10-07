// SPDX-License-Identifier: AGPL-3.0-only
import type {
  EffectiveAccessDto,
  InstallCapabilitiesDto,
  InstallCapability,
  Permission,
} from '@surefy/contracts'

import type { SettingsSection } from '@/constants/routes'

/** A settings section's message keys: `settings.sections.<id>` and `settings.<id>.…`. */
export type SettingsSectionId =
  'general' | 'members' | 'teams' | 'access' | 'vault' | 'dataPrivacy' | 'security' | 'install'

/**
 * One entry of the settings navigation (navigation.md §6). Like the sidebar, visibility comes
 * from effective access and the session, never from role names; all the given requirements hold.
 */
export interface SettingsSectionEntry {
  id: SettingsSectionId
  /** The URL segment: `/[orgSlug]/settings/<section>`. */
  section: SettingsSection
  /** Hidden until the section works end to end (ADR 0019); its page answers 404 meanwhile. */
  released: boolean
  /** Shown when the person holds at least one of these permissions. */
  anyPermission?: readonly Permission[]
  /** Shown only where the install offers this capability (ADR 0020). */
  installCapability?: InstallCapability
  /** Shown only to install administrators (self-hosted Install and License). */
  installAdminOnly?: boolean
}

/** What a section's visibility is decided from: effective access and the `GET /api/v1/me` session. */
export interface SettingsContext {
  access: EffectiveAccessDto
  install: InstallCapabilitiesDto
  isInstallAdmin: boolean
}
