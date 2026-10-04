// SPDX-License-Identifier: AGPL-3.0-only
/** The organization's Guard thresholds, 0–1. Data, never constants in the UI. */
export interface ConfidenceThresholds {
  /** Below this: needs a person. */
  low: number
  /** At or above this: automatic. */
  high: number
}

export type ConfidenceBand = 'high' | 'medium' | 'low'

/** Band words: "Automatic", "AI double-check", "Needs a person". Translated text. */
export type ConfidenceBandLabels = Record<ConfidenceBand, string>

export interface ConfidenceBarProps {
  /** 0–1. */
  value: number
  thresholds: ConfidenceThresholds
  bandLabels: ConfidenceBandLabels
  /** Accessible name ("Confidence"). */
  label: string
  /** 8px bar (`md`) or 6px in tables (`sm`). */
  size?: 'sm' | 'md'
  /** Formats the percentage for the locale; whole percent by default. */
  formatPercent?: (value: number) => string
  className?: string
}

export interface ConfidenceChipProps {
  value: number
  thresholds: ConfidenceThresholds
  bandLabels: ConfidenceBandLabels
  formatPercent?: (value: number) => string
  className?: string
}
