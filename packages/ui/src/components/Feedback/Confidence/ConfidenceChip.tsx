// SPDX-License-Identifier: AGPL-3.0-only
import { BAND_SOFT, formatWholePercent, getConfidenceBand } from './confidenceBand'
import { cn } from '../../../lib/utils'

import type { ConfidenceChipProps } from './Confidence.types'

/** Compact pill for lists: the percentage on the band's soft color; the band word for screen readers. */
export default function ConfidenceChip({
  value,
  thresholds,
  bandLabels,
  formatPercent = formatWholePercent,
  className,
}: Readonly<ConfidenceChipProps>) {
  const band = getConfidenceBand(value, thresholds)
  return (
    <span
      title={bandLabels[band]}
      className={cn(
        'text-caption inline-flex h-5 w-fit items-center rounded-full px-2 font-mono font-medium tabular-nums',
        BAND_SOFT[band],
        className,
      )}
    >
      {formatPercent(value)}
      <span className="sr-only"> · {bandLabels[band]}</span>
    </span>
  )
}
