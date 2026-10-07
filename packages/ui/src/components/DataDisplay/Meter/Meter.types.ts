// SPDX-License-Identifier: AGPL-3.0-only
export interface MeterProps {
  /** What is measured ("Seats"). Translated text. */
  label: string
  value: number
  max: number
  /** "380 of 400 seats". */
  valueText: string
  /** Share of `max` where the bar turns warning: the organization's alert threshold. Default 0.8. */
  warningAt?: number
  className?: string
}
