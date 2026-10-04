// SPDX-License-Identifier: AGPL-3.0-only
import type { ElementType } from 'react'

export interface VerifiedBadgeProps {
  /** "Approved by Ana Ruiz · 10:42 UTC". Only after a named person approved. */
  label: string
  /** The audit entry of the approval; the badge always links there. */
  href: string
  linkComponent?: ElementType
  className?: string
}
