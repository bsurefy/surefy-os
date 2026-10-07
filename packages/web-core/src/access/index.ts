// SPDX-License-Identifier: AGPL-3.0-only
export {
  getFeatureStatus,
  hasFeature,
  hasModule,
  hasPermission,
  isFeatureReadOnly,
} from './accessChecks'
export type { FeatureStatus } from './accessChecks'
export { Can } from './Can'
export type { CanProps } from './Can'
export { FeatureGate } from './FeatureGate'
export type { FeatureGateProps } from './FeatureGate'
export { getUpgradeLinks, hasInstallCapability } from './installCapabilities'
export type { UpgradeHrefs } from './installCapabilities'
export { OrgScopeProvider, useCurrentOrgId } from './OrgScopeProvider'
export { UpgradeCard } from './UpgradeCard'
export type { UpgradeCardProps } from './UpgradeCard.types'
export { UpgradeLinksProvider, useUpgradeLinks } from './UpgradeLinksProvider'
export type { UpgradeLinks } from './UpgradeLinksProvider'
export { useCan, useHasModule } from './useCan'
export { useEffectiveAccess } from './useEffectiveAccess'
export { useFeatureStatus, useHasFeature, useIsFeatureReadOnly } from './useHasFeature'
export { useHasInstallCapability } from './useHasInstallCapability'
export { usePartnerCan } from './usePartnerCan'
export { usePlatformCan } from './usePlatformCan'
