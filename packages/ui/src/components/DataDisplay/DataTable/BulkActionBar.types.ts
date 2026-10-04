// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react'

export interface BulkActionBarProps {
  labels: {
    /** "12 selected". */
    selected: string
    /** "Select all 1,284 matching", offered once the whole page is selected. */
    selectAllMatching?: string
    clear: string
  }
  onClear: () => void
  onSelectAllMatching?: () => void
  /** The bulk actions (buttons, a "⋯" menu). */
  children: ReactNode
  className?: string
}
