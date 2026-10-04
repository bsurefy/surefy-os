// SPDX-License-Identifier: AGPL-3.0-only
import type { EffectiveAccessDto, Feature, ModuleKey, Permission } from '@surefy/contracts'

/**
 * Pure checks on effective access, shared by the client hooks and each app's server guards
 * (`checkPageAccess`, `checkFeature`), so both sides answer the same way.
 */
export function hasPermission(access: EffectiveAccessDto, permission: Permission): boolean {
  return access.permissions.includes(permission)
}

export function hasModule(access: EffectiveAccessDto, module: ModuleKey): boolean {
  return access.modules.includes(module)
}

/** Fully available: usable and changeable. False during a license's read-only grace days. */
export function hasFeature(access: EffectiveAccessDto, feature: Feature): boolean {
  return access.features.includes(feature)
}

/** In the license's grace days: the screen stays visible, inputs show as text, actions hide. */
export function isFeatureReadOnly(access: EffectiveAccessDto, feature: Feature): boolean {
  return access.readOnlyFeatures.includes(feature)
}

export type FeatureStatus = 'available' | 'read-only' | 'unavailable'

export function getFeatureStatus(access: EffectiveAccessDto, feature: Feature): FeatureStatus {
  if (hasFeature(access, feature)) return 'available'
  if (isFeatureReadOnly(access, feature)) return 'read-only'
  return 'unavailable'
}
