// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { MoreHorizontal, SearchX } from 'lucide-react'
import { useState } from 'react'

import {
  BulkActionBar,
  DataTable,
  DataTableSearch,
  DataTableToolbar,
  DataTableViewMenu,
  EmptyState,
  StatusPill,
  type DataTableColumn,
  type DataTableSelection,
  type DataTableSort,
  type StatusTone,
} from '@surefy/ui/components/DataDisplay'
import { Section } from '@surefy/ui/components/Layout'
import { PaginationFooter } from '@surefy/ui/components/Navigation'
import { Button } from '@surefy/ui/primitives/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@surefy/ui/primitives/dropdown-menu'

interface Member {
  id: string
  name: string
  email: string
  role: string
  status: { label: string; tone: StatusTone }
  chats: number
}

const NAMES = [
  'Ana Ruiz',
  'Ben Okafor',
  'Chen Wei',
  'Dana Levi',
  'Elif Kaya',
  'Farah Haddad',
  'Gita Rao',
  'Hugo Martin',
]
const STATUSES: Member['status'][] = [
  { label: 'Active', tone: 'success' },
  { label: 'Invited', tone: 'info' },
  { label: 'Deactivated', tone: 'neutral' },
]
const MEMBERS: Member[] = NAMES.map((name, index) => ({
  id: `m${String(index + 1)}`,
  name,
  email: `${name.split(' ')[0]?.toLowerCase() ?? 'x'}@acme.com`,
  role: index === 0 ? 'Owner' : (['Admin', 'Member', 'Member'][index % 3] ?? 'Member'),
  status: STATUSES[index % 3] ?? { label: 'Active', tone: 'success' },
  chats: [1204, 87, 0, 4520, 312, 16, 990, 45][index] ?? 0,
}))

const columns: DataTableColumn<Member>[] = [
  { id: 'name', header: 'Name', cell: (row) => row.name, isSortable: true, isHideable: false },
  { id: 'email', header: 'Email', cell: (row) => row.email },
  { id: 'role', header: 'Role', cell: (row) => row.role, isSortable: true },
  {
    id: 'status',
    header: 'Status',
    cell: (row) => <StatusPill label={row.status.label} tone={row.status.tone} />,
  },
  {
    id: 'chats',
    header: 'Chats',
    cell: (row) => row.chats.toLocaleString('en-US'),
    align: 'end',
    isSortable: true,
  },
]

const SORT_VALUE: Record<string, (member: Member) => string | number> = {
  name: (member) => member.name,
  role: (member) => member.role,
  chats: (member) => member.chats,
}

function compare(a: Member, b: Member, sort: DataTableSort) {
  const value = SORT_VALUE[sort.id] ?? SORT_VALUE.name
  if (!value) return 0
  const [left, right] = [value(a), value(b)]
  const order =
    typeof left === 'number' && typeof right === 'number'
      ? left - right
      : String(left).localeCompare(String(right))
  return sort.desc ? -order : order
}

// The demo has a single page.
const stayOnPage = () => {
  // Nothing to load.
}

/** A members list wired like a real screen: search, sort, selection, view menu, paging. */
export default function TableDemo() {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<DataTableSort>({ id: 'name', desc: false })
  const [selection, setSelection] = useState<DataTableSelection>({})
  const [visibility, setVisibility] = useState<Record<string, boolean>>({})
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable')
  const [isLoading, setIsLoading] = useState(false)

  // Stands in for the API: it filters and sorts on the server.
  const rows = MEMBERS.filter((member) =>
    `${member.name} ${member.email}`.toLowerCase().includes(query.toLowerCase()),
  ).toSorted((a, b) => compare(a, b, sort))
  const selectedCount = Object.keys(selection).length

  return (
    <Section title="Data table" description="Search, sort, select, hide columns, change density.">
      <DataTableToolbar
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setIsLoading((value) => !value)
              }}
            >
              {isLoading ? 'Show rows' : 'Show loading'}
            </Button>
            <DataTableViewMenu
              labels={{
                trigger: 'View',
                columns: 'Columns',
                density: 'Density',
                comfortable: 'Comfortable',
                compact: 'Compact',
              }}
              columns={columns
                .filter((column) => column.isHideable !== false)
                .map((column) => ({ id: column.id, label: column.header }))}
              columnVisibility={visibility}
              onColumnVisibilityChange={setVisibility}
              density={density}
              onDensityChange={setDensity}
            />
          </>
        }
      >
        <DataTableSearch
          label="Search members"
          placeholder="Search by name or email"
          value={query}
          onValueChange={setQuery}
        />
      </DataTableToolbar>
      {selectedCount > 0 && (
        <BulkActionBar
          labels={{
            selected: `${String(selectedCount)} selected`,
            selectAllMatching: 'Select all 1,284 matching',
            clear: 'Clear',
          }}
          onClear={() => {
            setSelection({})
          }}
          onSelectAllMatching={
            selectedCount === rows.length
              ? () => {
                  setSelection(
                    Object.fromEntries(MEMBERS.map((member) => [member.id, true as const])),
                  )
                }
              : undefined
          }
        >
          <Button variant="secondary" size="sm">
            Change role
          </Button>
          <Button variant="destructive-ghost" size="sm">
            Deactivate
          </Button>
        </BulkActionBar>
      )}
      <div className="border-border overflow-hidden rounded-lg border">
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(row) => row.id}
          labels={{
            caption: 'Members',
            actions: 'Actions',
            selectAll: 'Select all rows on this page',
            selectRow: (id) => `Select ${MEMBERS.find((member) => member.id === id)?.name ?? id}`,
          }}
          density={density}
          sort={sort}
          onSortChange={setSort}
          selection={selection}
          onSelectionChange={setSelection}
          columnVisibility={visibility}
          getRowHref={(row) => `#member-${row.id}`}
          isLoading={isLoading}
          rowActions={(row) => (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${row.name}`}>
                  <MoreHorizontal aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>Change role</DropdownMenuItem>
                <DropdownMenuItem>Deactivate</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          emptyState={
            <EmptyState
              size="sm"
              headingLevel={3}
              icon={SearchX}
              title="No members match"
              description={`Nothing matches “${query}”. Check the spelling or search by email.`}
              secondaryAction={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery('')
                  }}
                >
                  Clear search
                </Button>
              }
            />
          }
        />
      </div>
      <PaginationFooter
        labels={{
          range: `1–${String(rows.length)} of ${String(rows.length)}`,
          previous: 'Previous page',
          next: 'Next page',
          pageSize: 'Rows per page',
        }}
        hasPrevious={false}
        hasNext={false}
        onPrevious={stayOnPage}
        onNext={stayOnPage}
      />
    </Section>
  )
}
