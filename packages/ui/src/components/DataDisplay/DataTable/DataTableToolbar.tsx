// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Search, SlidersHorizontal } from 'lucide-react'

import { cn } from '../../../lib/utils'
import { Button } from '../../../primitives/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../primitives/dropdown-menu'
import { Input } from '../../../primitives/input'

import type {
  DataTableSearchProps,
  DataTableToolbarProps,
  DataTableViewMenuProps,
} from './DataTableToolbar.types'

/** Row above a table: search and filters on the left, view and export on the right. */
export function DataTableToolbar({
  children,
  actions,
  className,
}: Readonly<DataTableToolbarProps>) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-2', className)}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Search box; its placeholder says what is searched ("Search by name or email"). */
export function DataTableSearch({
  label,
  placeholder,
  value,
  onValueChange,
  className,
}: Readonly<DataTableSearchProps>) {
  return (
    <div className={cn('relative w-full max-w-72', className)}>
      <Search
        aria-hidden
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
      />
      <Input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        className="pl-9"
        onChange={(event) => {
          onValueChange(event.target.value)
        }}
      />
    </div>
  )
}

/** "View" menu: column visibility and row density. */
export function DataTableViewMenu({
  labels,
  columns,
  columnVisibility,
  onColumnVisibilityChange,
  density,
  onDensityChange,
}: Readonly<DataTableViewMenuProps>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" icon={SlidersHorizontal}>
          {labels.trigger}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>{labels.columns}</DropdownMenuLabel>
        {columns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.id}
            checked={columnVisibility[column.id] !== false}
            onSelect={(event) => {
              event.preventDefault()
            }}
            onCheckedChange={(checked) => {
              onColumnVisibilityChange({ ...columnVisibility, [column.id]: checked })
            }}
          >
            {column.label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{labels.density}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={density}
          onValueChange={(value) => {
            onDensityChange(value === 'compact' ? 'compact' : 'comfortable')
          }}
        >
          <DropdownMenuRadioItem value="comfortable">{labels.comfortable}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="compact">{labels.compact}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
