// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import DataTable from './DataTable'

import type { DataTableColumn, DataTableSelection, DataTableSort } from './DataTable.types'

interface Member {
  id: string
  name: string
  role: string
  chats: number
}

const members: Member[] = [
  { id: 'm1', name: 'Ana Ruiz', role: 'Owner', chats: 1204 },
  { id: 'm2', name: 'Ben Okafor', role: 'Member', chats: 87 },
]

const columns: DataTableColumn<Member>[] = [
  { id: 'name', header: 'Name', cell: (row) => row.name, isSortable: true },
  { id: 'role', header: 'Role', cell: (row) => row.role },
  {
    id: 'chats',
    header: 'Chats',
    cell: (row) => row.chats.toLocaleString('en-US'),
    align: 'end',
    isSortable: true,
  },
]

const labels = {
  caption: 'Members',
  actions: 'Actions',
  selectAll: 'Select all rows on this page',
  selectRow: (id: string) => `Select ${members.find((member) => member.id === id)?.name ?? id}`,
}

function Members({
  onSortChange = vi.fn(),
}: Readonly<{ onSortChange?: (sort: DataTableSort) => void }>) {
  const [selection, setSelection] = useState<DataTableSelection>({})
  return (
    <>
      <DataTable
        columns={columns}
        data={members}
        getRowId={(row) => row.id}
        labels={labels}
        sort={{ id: 'name', desc: false }}
        onSortChange={onSortChange}
        selection={selection}
        onSelectionChange={setSelection}
        getRowHref={(row) => `/settings/members/${row.id}`}
        rowActions={(row) => <button type="button">More for {row.name}</button>}
      />
      <output>
        {Object.keys(selection)
          .toSorted((a, b) => a.localeCompare(b))
          .join(',')}
      </output>
    </>
  )
}

describe('DataTable', () => {
  it('names the table and marks the sorted column', async () => {
    const onSortChange = vi.fn()
    render(<Members onSortChange={onSortChange} />)
    const table = screen.getByRole('table', { name: 'Members' })
    expect(within(table).getByRole('columnheader', { name: /Name/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    )
    expect(within(table).getByRole('columnheader', { name: /Chats/ })).not.toHaveAttribute(
      'aria-sort',
    )
    expect(within(table).queryByRole('button', { name: 'Role' })).not.toBeInTheDocument()
    await userEvent.click(within(table).getByRole('button', { name: 'Name' }))
    expect(onSortChange).toHaveBeenLastCalledWith({ id: 'name', desc: true })
    await userEvent.click(within(table).getByRole('button', { name: 'Chats' }))
    expect(onSortChange).toHaveBeenLastCalledWith({ id: 'chats', desc: false })
  })

  it('opens the detail from a real link and keeps numbers right-aligned', () => {
    render(<Members />)
    expect(screen.getByRole('link', { name: 'Ana Ruiz' })).toHaveAttribute(
      'href',
      '/settings/members/m1',
    )
    expect(screen.getByRole('cell', { name: '1,204' })).toHaveClass('text-right', 'tabular-nums')
    expect(screen.getByRole('button', { name: 'More for Ben Okafor' })).toBeInTheDocument()
  })

  it('selects rows one by one and the whole page', async () => {
    render(<Members />)
    const selectAll = screen.getByRole('checkbox', { name: 'Select all rows on this page' })
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Ben Okafor' }))
    expect(screen.getByRole('status')).toHaveTextContent('m2')
    expect(selectAll).toHaveAttribute('data-state', 'indeterminate')
    await userEvent.click(selectAll)
    expect(screen.getByRole('status')).toHaveTextContent('m1,m2')
    expect(screen.getByRole('checkbox', { name: 'Select Ana Ruiz' })).toBeChecked()
  })

  it('hides columns, shows skeleton rows while loading and the empty state', () => {
    const { rerender } = render(
      <DataTable
        columns={columns}
        data={members}
        getRowId={(row) => row.id}
        labels={labels}
        columnVisibility={{ role: false }}
        isLoading
        loadingRowCount={3}
      />,
    )
    const table = screen.getByRole('table')
    expect(table).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('columnheader', { name: 'Role' })).not.toBeInTheDocument()
    expect(screen.queryByText('Ana Ruiz')).not.toBeInTheDocument()
    rerender(
      <DataTable
        columns={columns}
        data={[]}
        getRowId={(row) => row.id}
        labels={labels}
        emptyState={<p>No members match</p>}
      />,
    )
    expect(screen.getByText('No members match')).toBeInTheDocument()
  })
})
