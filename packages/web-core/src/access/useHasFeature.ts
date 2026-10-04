// SPDX-License-Identifier: AGPL-3.0-only
import type { Feature } from '@surefy/contracts'

import { getFeatureStatus, hasFeature, isFeatureReadOnly } from './accessChecks'
import { useEffectiveAccess } from './useEffectiveAccess'

import type { FeatureStatus } from './accessChecks'

/** Whether `feature` is fully available in the person's effective features; false until known. */
export function useHasFeature(feature: Feature): boolean {
  const { data } = useEffectiveAccess()
  return data ? hasFeature(data, feature) : false
}

/** True during a license's grace days: show the screen read-only and hide its actions. */
export function useIsFeatureReadOnly(feature: Feature): boolean {
  const { data } = useEffectiveAccess()
  return data ? isFeatureReadOnly(data, feature) : false
}

/** `pending` while effective access is loading or failed to load: never treated as unavailable. */
export function useFeatureStatus(feature: Feature): FeatureStatus | 'pending' {
  const { data } = useEffectiveAccess()
  return data ? getFeatureStatus(data, feature) : 'pending'
}
