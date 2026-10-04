// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { BulkActionBar } from './BulkActionBar'
import { DataTableSearch, DataTableViewMenu } from './DataTableToolbar'

describe('DataTable toolbar', () => {
  it('names the search box and reports what is typed', async () => {
    const onValueChange = vi.fn()
    render(
      <DataTableSearch
        label="Search members"
        placeholder="Search by name or email"
        value=""
        onValueChange={onValueChange}
      />,
    )
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search members' }), 'a')
    expect(onValueChange).toHaveBeenCalledWith('a')
  })

  it('hides a column and switches density from the view menu', async () => {
    const onColumnVisibilityChange = vi.fn()
    const onDensityChange = vi.fn()
    render(
      <DataTableViewMenu
        labels={{
          trigger: 'View',
          columns: 'Columns',
          density: 'Density',
          comfortable: 'Comfortable',
          compact: 'Compact',
        }}
        columns={[{ id: 'role', label: 'Role' }]}
        columnVisibility={{}}
        onColumnVisibilityChange={onColumnVisibilityChange}
        density="comfortable"
        onDensityChange={onDensityChange}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'View' }))
    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Role' }))
    expect(onColumnVisibilityChange).toHaveBeenCalledWith({ role: false })
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Compact' }))
    expect(onDensityChange).toHaveBeenCalledWith('compact')
  })

  it('offers select all matching and clear in the bulk bar', async () => {
    const onClear = vi.fn()
    const onSelectAllMatching = vi.fn()
    render(
      <BulkActionBar
        labels={{
          selected: '50 selected',
          selectAllMatching: 'Select all 1,284 matching',
          clear: 'Clear',
        }}
        onClear={onClear}
        onSelectAllMatching={onSelectAllMatching}
      >
        <button type="button">Deactivate</button>
      </BulkActionBar>,
    )
    expect(screen.getByRole('region', { name: '50 selected' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Select all 1,284 matching' }))
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onSelectAllMatching).toHaveBeenCalledOnce()
    expect(onClear).toHaveBeenCalledOnce()
  })
})
