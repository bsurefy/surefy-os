// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react'

export interface SliderInputProps {
  /** Accessible name of the slider and the number field ("High confidence from"). */
  label: string
  value: number
  onValueChange: (value: number) => void
  min: number
  max: number
  step?: number
  /** Unit after the number ("%"). */
  suffix?: ReactNode
  locale?: string
  isDisabled?: boolean
  /** Set by `Field`; goes to the number field. */
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  className?: string
}
