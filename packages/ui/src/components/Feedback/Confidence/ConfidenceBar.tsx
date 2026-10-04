// SPDX-License-Identifier: AGPL-3.0-only
import { BAND_FILL, formatWholePercent, getConfidenceBand } from './confidenceBand'
import { cn } from '../../../lib/utils'

import type { ConfidenceBarProps } from './Confidence.types'

/**
 * Bar, mono percentage and band word ("94% · Automatic"), with markers at the organization's low and
 * high thresholds. The number and the word carry the meaning; color only repeats it.
 */
export default function ConfidenceBar({
  value,
  thresholds,
  bandLabels,
  label,
  size = 'md',
  formatPercent = formatWholePercent,
  className,
}: Readonly<ConfidenceBarProps>) {
  const band = getConfidenceBand(value, thresholds)
  const text = `${formatPercent(value)} · ${bandLabels[band]}`
  const percent = (share: number) => `${String(Math.min(Math.max(share, 0), 1) * 100)}%`
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        aria-valuetext={text}
        className={cn(
          'bg-surface-2 relative min-w-16 flex-1 rounded-full',
          size === 'md' ? 'h-2' : 'h-1.5',
        )}
      >
        <div
          className={cn('h-full rounded-full', BAND_FILL[band])}
          style={{ width: percent(value) }}
        />
        {[thresholds.low, thresholds.high].map((threshold) => (
          <span
            key={threshold}
            aria-hidden
            className="bg-foreground-secondary absolute -top-0.5 -bottom-0.5 w-0.5 -translate-x-1/2 rounded-full"
            style={{ left: percent(threshold) }}
          />
        ))}
      </div>
      <span aria-hidden className="text-caption text-foreground shrink-0 whitespace-nowrap">
        <span className="font-mono tabular-nums">{formatPercent(value)}</span>
        <span className="text-foreground-secondary"> · {bandLabels[band]}</span>
      </span>
    </div>
  )
}
