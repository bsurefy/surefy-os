// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import {
  columnVisibilityFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type RowData,
  type Updater,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'

import { cn } from '../../../lib/utils'
import { Checkbox } from '../../../primitives/checkbox'
import { Skeleton } from '../../../primitives/skeleton'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../primitives/table'

import type {
  DataTableColumn,
  DataTableProps,
  DataTableSelection,
  DataTableSort,
} from './DataTable.types'

const features = tableFeatures({ rowSortingFeature, rowSelectionFeature, columnVisibilityFeature })
const NO_SELECTION: DataTableSelection = {}
const ALL_VISIBLE: Record<string, boolean> = {}
const SELECT_ID = '__select'
const ACTIONS_ID = '__actions'

function resolve<T>(updater: Updater<T>, current: T): T {
  return typeof updater === 'function' ? (updater as (old: T) => T)(current) : updater
}

function SortIcon({ sort, id }: Readonly<{ sort: DataTableSort | null | undefined; id: string }>) {
  if (sort?.id !== id) return <ArrowUpDown aria-hidden className="size-3.5 opacity-60" />
  return sort.desc ? (
    <ArrowDown aria-hidden className="size-3.5" />
  ) : (
    <ArrowUp aria-hidden className="size-3.5" />
  )
}

/**
 * The shared table for every list: sortable headers with `aria-sort`, a checkbox column, rows that
 * open their detail as a real link, a "⋯" action column, skeleton rows and an empty state.
 * Sorting, paging and selection are owned by the caller (server-side data).
 */
export default function DataTable<Row extends RowData>({
  columns,
  data,
  getRowId,
  labels,
  density = 'comfortable',
  sort,
  onSortChange,
  selection,
  onSelectionChange,
  columnVisibility = ALL_VISIBLE,
  getRowHref,
  linkComponent: Link = 'a',
  rowActions,
  isLoading = false,
  loadingRowCount = 5,
  emptyState,
  className,
}: Readonly<DataTableProps<Row>>) {
  // TanStack Table reads its state through row and column methods, which the React Compiler
  // cannot track; this component renders one page of rows, so it skips compiler memoization.
  'use no memo'
  const isSelectable = Boolean(onSelectionChange)
  const rowSelection = selection ?? NO_SELECTION
  const byId = new Map<string, DataTableColumn<Row>>(columns.map((column) => [column.id, column]))
  const linkColumnId = columns[0]?.id

  const tableColumns: ColumnDef<typeof features, Row>[] = [
    ...(isSelectable ? [{ id: SELECT_ID, enableSorting: false, enableHiding: false }] : []),
    ...columns.map((column) => ({
      id: column.id,
      enableSorting: column.isSortable ?? false,
      enableHiding: column.isHideable ?? true,
    })),
    ...(rowActions ? [{ id: ACTIONS_ID, enableSorting: false, enableHiding: false }] : []),
  ]

  const table = useTable({
    features,
    data,
    columns: tableColumns,
    getRowId: (row: Row) => getRowId(row),
    manualSorting: true,
    enableMultiSort: false,
    enableRowSelection: isSelectable,
    state: {
      sorting: sort ? [sort] : [],
      rowSelection,
      columnVisibility,
    },
    onSortingChange: (updater) => {
      const [next] = resolve(updater, sort ? [sort] : [])
      if (next) onSortChange?.({ id: next.id, desc: next.desc })
    },
    onRowSelectionChange: (updater) => {
      onSelectionChange?.(resolve(updater, rowSelection))
    },
  })

  const headers = table.getHeaderGroups()[0]?.headers ?? []
  const rows = table.getRowModel().rows
  const rowHeight = density === 'compact' ? 'h-9' : 'h-11'

  return (
    <Table aria-busy={isLoading || undefined} className={className}>
      <TableCaption className="sr-only">{labels.caption}</TableCaption>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {headers.map((header) => {
            const id = header.column.id
            if (id === SELECT_ID)
              return (
                <TableHead key={id} className="w-10">
                  <Checkbox
                    aria-label={labels.selectAll}
                    checked={
                      table.getIsAllPageRowsSelected() ||
                      (table.getIsSomePageRowsSelected() && 'indeterminate')
                    }
                    onCheckedChange={(checked) => {
                      table.toggleAllPageRowsSelected(checked === true)
                    }}
                  />
                </TableHead>
              )
            if (id === ACTIONS_ID)
              return (
                <TableHead key={id} className="w-12">
                  <span className="sr-only">{labels.actions}</span>
                </TableHead>
              )
            const column = byId.get(id)
            if (!column) return null
            const isSorted = sort?.id === id
            let ariaSort: 'ascending' | 'descending' | undefined
            if (isSorted) ariaSort = sort.desc ? 'descending' : 'ascending'
            return (
              <TableHead
                key={id}
                scope="col"
                aria-sort={ariaSort}
                style={{ width: column.width }}
                className={cn(column.align === 'end' && 'text-right')}
              >
                {column.isSortable ? (
                  <button
                    type="button"
                    className={cn(
                      'hover:text-foreground -mx-1 inline-flex items-center gap-1 rounded px-1',
                      isSorted && 'text-foreground',
                      column.align === 'end' && 'flex-row-reverse',
                    )}
                    onClick={() => {
                      onSortChange?.({ id, desc: isSorted ? !sort.desc : false })
                    }}
                  >
                    {column.header}
                    <SortIcon sort={sort} id={id} />
                  </button>
                ) : (
                  column.header
                )}
              </TableHead>
            )
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading &&
          Array.from({ length: loadingRowCount }, (_, index) => (
            <TableRow key={`loading-${String(index)}`} aria-hidden className="hover:bg-transparent">
              {headers.map((header) => (
                <TableCell key={header.id} className={rowHeight}>
                  <Skeleton className="h-3.5 w-full max-w-40" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        {!isLoading && rows.length === 0 && (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={headers.length} className="h-auto whitespace-normal">
              {emptyState}
            </TableCell>
          </TableRow>
        )}
        {!isLoading &&
          rows.map((row) => {
            const isSelected = row.getIsSelected()
            const href = getRowHref?.(row.original)
            return (
              <TableRow
                key={row.id}
                data-state={isSelected ? 'selected' : undefined}
                className={cn(href && 'relative cursor-pointer')}
              >
                {row.getVisibleCells().map((cell) => {
                  const id = cell.column.id
                  if (id === SELECT_ID)
                    return (
                      <TableCell key={cell.id} className={rowHeight}>
                        <Checkbox
                          aria-label={labels.selectRow?.(row.id)}
                          checked={isSelected}
                          className="z-10"
                          onCheckedChange={(checked) => {
                            row.toggleSelected(checked === true)
                          }}
                        />
                      </TableCell>
                    )
                  if (id === ACTIONS_ID)
                    return (
                      <TableCell
                        key={cell.id}
                        className={cn(rowHeight, 'relative z-10 text-right')}
                      >
                        {rowActions?.(row.original)}
                      </TableCell>
                    )
                  const column = byId.get(id)
                  if (!column) return null
                  const content = column.cell(row.original)
                  return (
                    <TableCell
                      key={cell.id}
                      className={cn(rowHeight, column.align === 'end' && 'text-right tabular-nums')}
                    >
                      {href && id === linkColumnId ? (
                        // The link covers the row, so the whole row opens the detail.
                        <Link
                          href={href}
                          className="text-foreground font-medium after:absolute after:inset-0 hover:underline"
                        >
                          {content}
                        </Link>
                      ) : (
                        content
                      )}
                    </TableCell>
                  )
                })}
              </TableRow>
            )
          })}
      </TableBody>
    </Table>
  )
}
