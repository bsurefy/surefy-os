// SPDX-License-Identifier: AGPL-3.0-only
import type { ComponentProps, ReactNode } from 'react'

export interface NumberInputProps extends Omit<
  ComponentProps<'input'>,
  'value' | 'defaultValue' | 'onChange' | 'type' | 'prefix' | 'min' | 'max' | 'step'
> {
  /** `null` when the field is empty. */
  value: number | null
  onValueChange: (value: number | null) => void
  min?: number
  max?: number
  /** Arrow keys and the stepper change the value by this much. Default 1. */
  step?: number
  /** Unit before the value ("$"). */
  prefix?: ReactNode
  /** Unit after the value ("%", "seats"). */
  suffix?: ReactNode
  /** Formatting locale; the browser's when omitted. */
  locale?: string
  /** Display format, for example `{ maximumFractionDigits: 2 }`. */
  formatOptions?: Intl.NumberFormatOptions
  /** Shows − and + buttons. Their labels are translated text ("Decrease", "Increase"). */
  stepper?: { decrementLabel: string; incrementLabel: string }
}
