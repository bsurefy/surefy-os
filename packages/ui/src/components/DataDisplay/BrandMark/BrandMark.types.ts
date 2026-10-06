// SPDX-License-Identifier: AGPL-3.0-only
export interface BrandMarkProps {
  /** Side of the mark in pixels (28 in the sidebar, 44 in empty states, 24 beside answers). */
  size?: number
  /** Wordmark shown beside the mark ("Surefy"); omitted in collapsed or icon-only places. */
  wordmark?: string
  /** Part of the wordmark drawn in the primary color ("OS"). */
  accent?: string
  /** Accessible name when the mark stands alone; decorative without it. Translated text. */
  label?: string
  className?: string
}
