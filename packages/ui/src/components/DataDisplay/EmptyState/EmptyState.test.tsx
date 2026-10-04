// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Bot } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'

import EmptyState from './EmptyState'

describe('EmptyState', () => {
  it('names the next step and offers the action', async () => {
    const onAction = vi.fn()
    render(
      <EmptyState
        icon={Bot}
        title="Create your first agent"
        description="Agents answer questions and take actions."
        actionLabel="Create agent"
        onAction={onAction}
      />,
    )
    expect(
      screen.getByRole('heading', { level: 2, name: 'Create your first agent' }),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Create agent' }))
    expect(onAction).toHaveBeenCalledOnce()
  })

  it('tells people who cannot act whom to ask instead of a disabled button', () => {
    render(
      <EmptyState
        title="No agents yet"
        actionLabel="Create agent"
        note="Ask an admin to create an agent."
        headingLevel={3}
      />,
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument()
    expect(screen.getByText('Ask an admin to create an agent.')).toBeInTheDocument()
  })
})
