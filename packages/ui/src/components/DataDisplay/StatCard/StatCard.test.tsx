// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import EditionBadge from '../EditionBadge'
import Meter from '../Meter'
import StatusPill from '../StatusPill'
import Tag from '../Tag'
import StatCard from './StatCard'

describe('StatCard', () => {
  it('shows the value and the delta in words', () => {
    render(
      <StatCard
        label="Active members"
        value="1,284"
        delta={{ label: '+6 this quarter', direction: 'up', tone: 'positive' }}
        href="/settings/members"
      />,
    )
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/settings/members')
    expect(link).toHaveTextContent('Active members1,284+6 this quarter')
    expect(screen.getByText('+6 this quarter')).toHaveClass('text-success')
  })

  it('shows a dash and "Restricted" instead of a restricted value, never zero', () => {
    render(<StatCard label="Spend" value="0" isRestricted restrictedLabel="Restricted" />)
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('Restricted')).toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })
})

describe('Meter', () => {
  it('reports used of limit and warns at the alert threshold', () => {
    const { rerender } = render(
      <Meter label="Seats" value={380} max={400} valueText="380 of 400 seats" />,
    )
    const meter = screen.getByRole('meter', { name: 'Seats' })
    expect(meter).toHaveAttribute('aria-valuetext', '380 of 400 seats')
    expect(screen.getByText('380 of 400 seats')).toHaveClass('text-warning')
    rerender(<Meter label="Seats" value={420} max={400} valueText="420 of 400 seats" />)
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '400')
    expect(screen.getByText('420 of 400 seats')).toHaveClass('text-destructive')
  })
})

describe('Badges', () => {
  it('shows status words, tags and edition badges as text', () => {
    render(
      <>
        <StatusPill label="Running" tone="info" isPulsing />
        <Tag>v1.2.0</Tag>
        <EditionBadge label="Enterprise" />
      </>,
    )
    expect(screen.getByText('Running')).toHaveClass('bg-info-soft')
    expect(screen.getByText('v1.2.0')).toHaveClass('font-mono')
    expect(screen.getByText('Enterprise')).toBeInTheDocument()
  })
})
