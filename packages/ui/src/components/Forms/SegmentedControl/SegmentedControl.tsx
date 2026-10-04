// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { RadioGroup as RadioGroupPrimitive } from 'radix-ui'

import { cn } from '../../../lib/utils'

import type { SegmentedControlProps } from './SegmentedControl.types'

/** 2–5 mutually exclusive filters or modes, as a radio group: arrow keys move the choice. */
export default function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onValueChange,
  size = 'md',
  className,
}: Readonly<SegmentedControlProps<T>>) {
  return (
    <RadioGroupPrimitive.Root
      aria-label={label}
      orientation="horizontal"
      value={value}
      onValueChange={(next) => {
        onValueChange(next as T)
      }}
      className={cn(
        'border-border bg-surface-2 inline-flex items-stretch gap-0.5 rounded-lg border p-0.5',
        size === 'md' ? 'h-9' : 'h-7',
        className,
      )}
    >
      {options.map(
        ({ value: optionValue, label: optionLabel, icon: Icon, isIconOnly, isDisabled }) => (
          <RadioGroupPrimitive.Item
            key={optionValue}
            value={optionValue}
            disabled={isDisabled}
            aria-label={isIconOnly ? optionLabel : undefined}
            className={cn(
              'text-foreground-secondary hover:text-foreground data-[state=checked]:bg-surface data-[state=checked]:text-foreground data-[state=checked]:border-border duration-fast flex items-center justify-center gap-1.5 rounded-md border border-transparent transition-colors disabled:pointer-events-none disabled:opacity-50 data-[state=checked]:shadow-xs',
              size === 'md' ? 'text-body px-3' : 'text-label px-2',
            )}
          >
            {Icon && <Icon aria-hidden className="size-4" />}
            {!isIconOnly && optionLabel}
          </RadioGroupPrimitive.Item>
        ),
      )}
    </RadioGroupPrimitive.Root>
  )
}
