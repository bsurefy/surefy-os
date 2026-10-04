// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { cn } from '../../../lib/utils'
import { Slider } from '../../../primitives/slider'
import NumberInput from '../NumberInput'

import type { SliderInputProps } from './SliderInput.types'

/** Threshold editing: a slider with the exact number next to it; both move together. */
export default function SliderInput({
  label,
  value,
  onValueChange,
  min,
  max,
  step = 1,
  suffix,
  locale,
  isDisabled = false,
  className,
  ...aria
}: Readonly<SliderInputProps>) {
  return (
    <div className={cn('flex items-center gap-4', className)}>
      <Slider
        thumbLabel={label}
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={isDisabled}
        onValueChange={([next]) => {
          if (next !== undefined) onValueChange(next)
        }}
        className="flex-1"
      />
      <NumberInput
        aria-label={label}
        value={value}
        onValueChange={(next) => {
          onValueChange(next ?? min)
        }}
        min={min}
        max={max}
        step={step}
        suffix={suffix}
        locale={locale}
        disabled={isDisabled}
        className="w-24 shrink-0"
        {...aria}
      />
    </div>
  )
}
