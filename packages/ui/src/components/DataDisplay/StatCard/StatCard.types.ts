// SPDX-License-Identifier: AGPL-3.0-only
import type { ElementType } from 'react'

export interface StatCardDelta {
  /** Arrow and word: "+6 this quarter". Translated text. */
  label: string
  direction: 'up' | 'down' | 'flat'
  /** Whether the change is good; up is not always good (costs). Default neutral. */
  tone?: 'positive' | 'negative' | 'neutral'
}

export interface StatCardProps {
  /** "Active members". */
  label: string
  /** Formatted value ("1,284", "$2,500"). */
  value: string
  /** One line under the value ("Files, pages and synced docs"). Translated text. */
  description?: string
  /** `md` (page-title value, 20px padding) or `sm` (object-title value, 16px padding). */
  size?: 'md' | 'sm'
  delta?: StatCardDelta
  /** Small trend line under the value. */
  sparkline?: number[]
  /** The person may not see this value: shows "—", a lock and `restrictedLabel`, never zero. */
  isRestricted?: boolean
  /** "Restricted". */
  restrictedLabel?: string
  /** Makes the whole card a link to the detail. */
  href?: string
  linkComponent?: ElementType
  className?: string
}
