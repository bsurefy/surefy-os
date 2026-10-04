// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import Breadcrumbs from './Breadcrumbs'

describe('Breadcrumbs', () => {
  it('links every level but the current one', () => {
    render(
      <Breadcrumbs
        label="Breadcrumb"
        items={[{ label: 'Agents', href: '/agents' }, { label: 'Support bot' }]}
      />,
    )
    expect(screen.getByRole('link', { name: 'Agents' })).toHaveAttribute('href', '/agents')
    expect(screen.queryByRole('link', { name: 'Support bot' })).toBeNull()
    expect(screen.getByText('Support bot')).toHaveAttribute('aria-current', 'page')
  })

  it('keeps at most three levels and truncates the middle', () => {
    render(
      <Breadcrumbs
        label="Breadcrumb"
        items={[
          { label: 'Settings', href: '/s' },
          { label: 'Teams', href: '/t' },
          { label: 'Support', href: '/t/1' },
          { label: 'Members' },
        ]}
      />,
    )
    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.queryByText('Teams')).toBeNull()
    expect(screen.getByText('Support')).toBeInTheDocument()
    expect(screen.getByText('Members')).toBeInTheDocument()
  })
})
