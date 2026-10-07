// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import CommandPalette from '../CommandPalette'
import SidePanel from './SidePanel'

describe('SidePanel', () => {
  it('has the object title, row navigation, full page link and close', async () => {
    const onNext = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <SidePanel
        open
        onOpenChange={onOpenChange}
        title="Ana Ruiz"
        onNext={onNext}
        fullPageHref="/settings/members/m1"
        footer={<button type="button">Save</button>}
      >
        <p>Owner since 2024</p>
      </SidePanel>,
    )
    expect(screen.getByRole('dialog', { name: 'Ana Ruiz' })).toHaveTextContent('Owner since 2024')
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onNext).toHaveBeenCalledOnce()
    expect(screen.getByRole('link', { name: 'Open full page' })).toHaveAttribute(
      'href',
      '/settings/members/m1',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

describe('CommandPalette', () => {
  const labels = {
    title: 'Search and commands',
    description: 'Search agents, chats and people, or run an action',
    placeholder: 'Search agents, chats, people or actions',
    empty: (query: string) => `No results for "${query}"`,
  }

  it('shows recent items first, filters, and runs the chosen item', async () => {
    const onCreate = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <CommandPalette
        open
        onOpenChange={onOpenChange}
        labels={labels}
        recent={{
          heading: 'Recent',
          items: [{ id: 'c1', label: 'Refund policy chat', onSelect: vi.fn() }],
        }}
        groups={[
          {
            heading: 'Actions',
            items: [{ id: 'new-agent', label: 'Create agent', onSelect: onCreate }],
          },
        ]}
      />,
    )
    expect(screen.getByRole('dialog', { name: 'Search and commands' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Refund policy chat' })).toBeInTheDocument()
    const input = screen.getByPlaceholderText('Search agents, chats, people or actions')
    await userEvent.type(input, 'zzz')
    expect(screen.getByText('No results for "zzz"')).toBeInTheDocument()
    await userEvent.clear(input)
    await userEvent.type(input, 'create')
    expect(screen.queryByRole('option', { name: 'Refund policy chat' })).not.toBeInTheDocument()
    await userEvent.keyboard('{Enter}')
    expect(onCreate).toHaveBeenCalledOnce()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
