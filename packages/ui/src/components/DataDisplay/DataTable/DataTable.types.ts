// SPDX-License-Identifier: AGPL-3.0-only
import type { ElementType, ReactNode } from 'react'

export interface DataTableColumn<Row> {
  /** Stable id; also the key in `columnVisibility` and the sort id sent to the API. */
  id: string
  /** Header text, also the name of its sort button. Translated text. */
  header: string
  cell: (row: Row) => ReactNode
  /** `end` for numbers: right-aligned, tabular figures. */
  align?: 'start' | 'end'
  isSortable?: boolean
  /** The view menu may hide it. Default true. */
  isHideable?: boolean
  /** Column width, any CSS length ("8rem"). */
  width?: string
}

/** One sort at a time; the API sorts (server-side). */
export interface DataTableSort {
  id: string
  desc: boolean
}

/** Selected row ids. Selection survives paging; the caller owns it. */
export type DataTableSelection = Record<string, true>

export interface DataTableLabels {
  /** Accessible name of the table ("Members"). */
  caption: string
  /** Header of the row action column, for screen readers ("Actions"). */
  actions?: string
  /** "Select all rows on this page". */
  selectAll?: string
  /** (row) => "Select Ana Ruiz". */
  selectRow?: (rowId: string) => string
}

export interface DataTableProps<Row> {
  columns: DataTableColumn<Row>[]
  data: Row[]
  getRowId: (row: Row) => string
  labels: DataTableLabels
  /** Comfortable 44px rows (Workspace, Partner) or compact 36px (Console default). */
  density?: 'comfortable' | 'compact'
  sort?: DataTableSort | null
  onSortChange?: (sort: DataTableSort) => void
  /** Turns on the checkbox column. */
  selection?: DataTableSelection
  onSelectionChange?: (selection: DataTableSelection) => void
  /** Hidden columns are `false`. */
  columnVisibility?: Record<string, boolean>
  /** Makes the whole row open the detail, as a real link in the first column. */
  getRowHref?: (row: Row) => string
  linkComponent?: ElementType
  /** The "⋯" menu at the end of each row. */
  rowActions?: (row: Row) => ReactNode
  isLoading?: boolean
  /** Skeleton rows while loading. Default 5. */
  loadingRowCount?: number
  /** Shown when there are no rows: EmptyState for a first visit or "No results" for a search. */
  emptyState?: ReactNode
  className?: string
}
