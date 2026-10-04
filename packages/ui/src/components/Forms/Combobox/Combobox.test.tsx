// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import MultiSelect from '../MultiSelect'
import Combobox from './Combobox'

import type { ComboboxOption } from './Combobox.types'

const teams: ComboboxOption[] = [
  { value: 'support', label: 'Support' },
  { value: 'sales', label: 'Sales' },
  { value: 'legal', label: 'Legal', description: '4 members' },
  { value: 'finance', label: 'Finance' },
  { value: 'research', label: 'Research' },
]
const labels = { placeholder: 'Select a team', search: 'Search teams', empty: 'No teams match' }

describe('Combobox', () => {
  it('filters as the person types and selects an option', async () => {
    const onValueChange = vi.fn()
    render(
      <Combobox
        aria-label="Team"
        options={teams}
        value={null}
        onValueChange={onValueChange}
        labels={labels}
      />,
    )
    const trigger = screen.getByRole('combobox', { name: 'Team' })
    expect(trigger).toHaveTextContent('Select a team')
    await userEvent.click(trigger)
    await userEvent.type(screen.getByPlaceholderText('Search teams'), 'leg')
    expect(screen.queryByRole('option', { name: 'Sales' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('option', { name: /Legal/ }))
    expect(onValueChange).toHaveBeenCalledWith('legal')
  })

  it('hands the query to an async search without filtering again', async () => {
    const onSearchChange = vi.fn()
    render(
      <Combobox
        aria-label="Team"
        options={teams}
        value="sales"
        onValueChange={vi.fn()}
        labels={labels}
        onSearchChange={onSearchChange}
      />,
    )
    expect(screen.getByRole('combobox', { name: 'Team' })).toHaveTextContent('Sales')
    await userEvent.click(screen.getByRole('combobox', { name: 'Team' }))
    await userEvent.type(screen.getByPlaceholderText('Search teams'), 'zz')
    expect(onSearchChange).toHaveBeenLastCalledWith('zz')
    expect(screen.getAllByRole('option')).toHaveLength(teams.length)
  })
})

function Teams() {
  const [value, setValue] = useState(['support', 'sales', 'legal', 'finance', 'research'])
  return (
    <MultiSelect
      aria-label="Teams"
      options={teams}
      value={value}
      onValueChange={setValue}
      labels={{ ...labels, remove: (label) => `Remove ${label}`, more: (count) => `+${count}` }}
    />
  )
}

describe('MultiSelect', () => {
  it('shows the first chips, then +N, each with a named remove button', async () => {
    render(<Teams />)
    expect(screen.getByText('+2')).toBeInTheDocument()
    const remove = screen.getByRole('button', { name: 'Remove Support' })
    expect(remove).toHaveClass('size-6')
    await userEvent.click(remove)
    expect(screen.queryByRole('button', { name: 'Remove Support' })).not.toBeInTheDocument()
    expect(screen.getByText('+1')).toBeInTheDocument()
  })

  it('toggles options from the list and stays open', async () => {
    render(<Teams />)
    await userEvent.click(screen.getByRole('combobox', { name: 'Teams' }))
    await userEvent.click(screen.getByRole('option', { name: 'Sales' }))
    expect(screen.queryByRole('button', { name: 'Remove Sales' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Support' })).toBeInTheDocument()
  })
})
