// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import Tabs from './Tabs'

const items = [
  { value: 'sources', label: 'Sources', count: 12 },
  { value: 'search', label: 'Test search' },
  { value: 'access', label: 'Access' },
]

describe('Tabs', () => {
  it('renders route tabs as links with the current one marked', () => {
    render(
      <Tabs
        label="Knowledge base"
        value="search"
        items={items.map((item) => ({ ...item, href: `/kb/1/${item.value}` }))}
      />,
    )
    expect(screen.getByRole('link', { name: 'Test search' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: /Sources/ })).toHaveTextContent('12')
  })

  it('moves between in-page tabs with the arrow keys', async () => {
    const onValueChange = vi.fn()
    render(<Tabs label="Views" value="sources" items={items} onValueChange={onValueChange} />)
    expect(screen.getByRole('tab', { name: /Sources/ })).toHaveAttribute('aria-selected', 'true')
    screen.getByRole('tab', { name: /Sources/ }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onValueChange).toHaveBeenLastCalledWith('search')
    await userEvent.keyboard('{ArrowLeft}')
    expect(onValueChange).toHaveBeenLastCalledWith('access')
  })
})
