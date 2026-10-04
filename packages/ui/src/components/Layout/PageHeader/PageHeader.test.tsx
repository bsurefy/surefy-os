// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import PageHeader from './PageHeader'

describe('PageHeader', () => {
  it('renders one h1 with the page title style', () => {
    render(<PageHeader title="Agents" description="Build and run agents" />)
    const heading = screen.getByRole('heading', { level: 1, name: 'Agents' })
    expect(heading).toHaveClass('text-page-title')
    expect(screen.getAllByRole('heading')).toHaveLength(1)
  })

  it('uses the object title style on detail pages', () => {
    render(<PageHeader level="object" title="Support bot" status={<span>Live</span>} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('text-object-title')
    expect(screen.getByText('Live')).toBeInTheDocument()
  })
})
