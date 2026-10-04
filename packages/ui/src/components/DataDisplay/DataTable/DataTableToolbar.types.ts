// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react'

export interface DataTableToolbarProps {
  /** Search and filter buttons. */
  children: ReactNode
  /** View menu, export. */
  actions?: ReactNode
  className?: string
}

export interface DataTableSearchProps {
  /** Accessible name ("Search members"). */
  label: string
  /** Says what is searched ("Search by name or email"). */
  placeholder: string
  value: string
  onValueChange: (value: string) => void
  className?: string
}

export interface DataTableViewMenuLabels {
  /** "View". */
  trigger: string
  columns: string
  density: string
  comfortable: string
  compact: string
}

export interface DataTableViewMenuProps {
  labels: DataTableViewMenuLabels
  /** Columns the person may hide, with their translated labels. */
  columns: { id: string; label: string }[]
  columnVisibility: Record<string, boolean>
  onColumnVisibilityChange: (visibility: Record<string, boolean>) => void
  density: 'comfortable' | 'compact'
  onDensityChange: (density: 'comfortable' | 'compact') => void
}
