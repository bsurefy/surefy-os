// SPDX-License-Identifier: AGPL-3.0-only
import { hasInstallCapability, hasPermission } from '@surefy/web-core/access'

import type { SettingsContext, SettingsSectionEntry } from './Settings.types'

/** Whether the person sees a settings section: released, and every requirement it names holds. */
export function isSettingsSectionVisible(
  entry: SettingsSectionEntry,
  context: SettingsContext,
): boolean {
  if (!entry.released) return false
  const permissions = entry.anyPermission ?? []
  if (
    permissions.length > 0 &&
    !permissions.some((permission) => hasPermission(context.access, permission))
  ) {
    return false
  }
  if (
    entry.installCapability !== undefined &&
    !hasInstallCapability(context.install, entry.installCapability)
  ) {
    return false
  }
  return entry.installAdminOnly !== true || context.isInstallAdmin
}

/** The sections the person sees, in display order. */
export function getVisibleSettingsSections(
  entries: readonly SettingsSectionEntry[],
  context: SettingsContext,
): SettingsSectionEntry[] {
  return entries.filter((entry) => isSettingsSectionVisible(entry, context))
}
