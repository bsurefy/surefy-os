// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { getConfidenceBand } from './confidenceBand'
import ConfidenceBar from './ConfidenceBar'
import ConfidenceChip from './ConfidenceChip'

const thresholds = { low: 0.6, high: 0.9 }
const bandLabels = { high: 'Automatic', medium: 'AI double-check', low: 'Needs a person' }
const format = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 }).format(value)

describe('Confidence', () => {
  it('uses the organization thresholds, not constants', () => {
    expect(getConfidenceBand(0.94, thresholds)).toBe('high')
    expect(getConfidenceBand(0.72, thresholds)).toBe('medium')
    expect(getConfidenceBand(0.41, thresholds)).toBe('low')
    expect(getConfidenceBand(0.72, { low: 0.5, high: 0.7 })).toBe('high')
  })

  it('shows the number and the band word, never color alone', () => {
    render(
      <ConfidenceBar
        label="Confidence"
        value={0.94}
        thresholds={thresholds}
        bandLabels={bandLabels}
        formatPercent={format}
      />,
    )
    const meter = screen.getByRole('meter', { name: 'Confidence' })
    expect(meter).toHaveAttribute('aria-valuetext', '94% · Automatic')
    expect(meter).toHaveAttribute('aria-valuenow', '94')
    expect(screen.getByText('94%')).toHaveClass('font-mono')
  })

  it('names the band in the chip for screen readers', () => {
    render(
      <ConfidenceChip
        value={0.41}
        thresholds={thresholds}
        bandLabels={bandLabels}
        formatPercent={format}
      />,
    )
    expect(screen.getByText('41%')).toHaveTextContent('41% · Needs a person')
    expect(screen.getByText('41%')).toHaveClass('bg-destructive-soft')
  })
})
