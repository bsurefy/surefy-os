// SPDX-License-Identifier: AGPL-3.0-only
export interface ProgressBarProps {
  /** What is in progress ("Indexing Product docs"). Translated text. */
  label: string
  /** 0–100. */
  value: number
  /** Shown on the right and read out; the rounded percentage when omitted ("42%", "84 of 200 files"). */
  valueText?: string
  className?: string
}
