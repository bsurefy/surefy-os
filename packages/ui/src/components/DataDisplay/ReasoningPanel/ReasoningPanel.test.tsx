// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import DataLocationBadge from '../DataLocationBadge'
import ProviderChip from '../ProviderChip'
import VerifiedBadge from '../VerifiedBadge'
import ReasoningPanel from './ReasoningPanel'

describe('Trust components', () => {
  it('explains why the AI suggests something, with sources and the run', () => {
    render(
      <ReasoningPanel
        labels={{ title: 'Why the AI suggests this', sources: 'Sources', run: 'See the full run' }}
        reasons={[{ text: 'The invoice total matches the order', confidence: '94%' }]}
        sources={[{ label: 'invoice-2041.pdf', href: '/knowledge/doc/1' }]}
        runHref="/runs/r1"
      />,
    )
    expect(screen.getByRole('region', { name: 'Why the AI suggests this' })).toBeInTheDocument()
    expect(screen.getByText('94%')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'invoice-2041.pdf' })).toHaveAttribute(
      'href',
      '/knowledge/doc/1',
    )
    expect(screen.getByRole('link', { name: 'See the full run' })).toHaveAttribute(
      'href',
      '/runs/r1',
    )
  })

  it("links a person's approval to its audit entry", () => {
    render(<VerifiedBadge label="Approved by Ana Ruiz · 10:42 UTC" href="/guard/audit/a1" />)
    expect(screen.getByRole('link', { name: 'Approved by Ana Ruiz · 10:42 UTC' })).toHaveAttribute(
      'href',
      '/guard/audit/a1',
    )
  })

  it('shows provider status in words and a dashed outline without a key', () => {
    render(<ProviderChip name="Anthropic" status="not-connected" statusLabel="Not connected" />)
    expect(screen.getByText('Not connected')).toBeInTheDocument()
    expect(screen.getByText('Anthropic').parentElement).toHaveClass('border-dashed')
  })

  it('says where the data went', () => {
    render(<DataLocationBadge location="local" label="Stays on your server" />)
    expect(screen.getByText('Stays on your server')).toHaveClass('bg-success-soft')
  })
})
