// SPDX-License-Identifier: AGPL-3.0-only
import type { ConfidenceBand, ConfidenceThresholds } from './Confidence.types'

/** Which band a confidence value falls in, from the organization's thresholds. */
export function getConfidenceBand(value: number, thresholds: ConfidenceThresholds): ConfidenceBand {
  if (value >= thresholds.high) return 'high'
  if (value >= thresholds.low) return 'medium'
  return 'low'
}

export const formatWholePercent = (value: number) =>
  new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 0 }).format(value)

export const BAND_FILL: Record<ConfidenceBand, string> = {
  high: 'bg-confidence-high',
  medium: 'bg-confidence-medium',
  low: 'bg-confidence-low',
}

export const BAND_SOFT: Record<ConfidenceBand, string> = {
  high: 'bg-success-soft text-success-soft-foreground',
  medium: 'bg-warning-soft text-warning-soft-foreground',
  low: 'bg-destructive-soft text-destructive-soft-foreground',
}
