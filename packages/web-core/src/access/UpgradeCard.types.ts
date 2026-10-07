// SPDX-License-Identifier: AGPL-3.0-only
import type { Feature } from '@surefy/contracts'

import type { ReactNode } from 'react'

export interface UpgradeCardProps {
  feature: Feature
  /** A static picture of the gated screen, built from fixture data, never real data. */
  preview?: ReactNode
  /** Heading level inside the page. Default 2. */
  headingLevel?: 2 | 3
  className?: string
}
