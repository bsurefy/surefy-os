// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import type { Feature } from '@surefy/contracts'

import { useFeatureStatus } from './useHasFeature'

import type { ReactNode } from 'react'

export interface FeatureGateProps {
  feature: Feature
  /** Shown when the feature is unavailable: usually `<UpgradeCard feature={…} />`. */
  fallback: ReactNode
  /** Shown while effective access is loading (or failed to load). Default: nothing. */
  loading?: ReactNode
  children: ReactNode
}

/**
 * Renders a screen or section only when its feature is available, or read-only during a license's
 * grace days (the screen checks `useIsFeatureReadOnly`). While access is unknown it renders
 * `loading`, never the fallback, so the upgrade card never flashes.
 */
export function FeatureGate({
  feature,
  fallback,
  loading = null,
  children,
}: Readonly<FeatureGateProps>): ReactNode {
  const status = useFeatureStatus(feature)
  const content: Record<typeof status, ReactNode> = {
    pending: loading,
    unavailable: fallback,
    available: children,
    'read-only': children,
  }
  return content[status]
}
