// SPDX-License-Identifier: AGPL-3.0-only
// The Settings module: the organization's settings sections (the sidebar lists them). Its
// server guards (`Settings.server.ts`) make this entry server-only: client code imports the
// files it needs directly.
export { default as AccessSettings } from './AccessSettings'
export { default as DataPrivacySettings } from './DataPrivacySettings'
export { default as GeneralSettings } from './GeneralSettings'
export { default as InstallSettings } from './InstallSettings'
export { default as MembersSettings } from './MembersSettings'
export { default as SecuritySettings } from './SecuritySettings'
export { default as TeamsSettings } from './TeamsSettings'
export { commands } from './Settings.commands'
export { SETTINGS_PERMISSIONS, SETTINGS_SECTIONS } from './Settings.constants'
export { checkSettingsSection, getFirstSettingsSection } from './Settings.server'
export type { SettingsSectionEntry, SettingsSectionId } from './Settings.types'
