// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { RadioGroup as RadioGroupPrimitive } from 'radix-ui'

import { cn } from '../../../lib/utils'

import type { FilterChipsProps } from './FilterChips.types'

/** A row of pill filters with counts, as a radio group: one chip is always selected. */
export default function FilterChips<T extends string>({
  label,
  options,
  value,
  onValueChange,
  className,
}: Readonly<FilterChipsProps<T>>) {
  return (
    <RadioGroupPrimitive.Root
      aria-label={label}
      orientation="horizontal"
      value={value}
      onValueChange={(next) => {
        onValueChange(next as T)
      }}
      className={cn('flex flex-wrap items-center gap-1.5', className)}
    >
      {options.map((option) => (
        <RadioGroupPrimitive.Item
          key={option.value}
          value={option.value}
          disabled={option.isDisabled}
          className="border-border bg-surface text-foreground-secondary hover:text-foreground hover:bg-surface-2 data-[state=checked]:bg-primary-soft data-[state=checked]:text-primary-soft-foreground data-[state=checked]:border-primary-soft text-label duration-fast focus-visible:outline-ring inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50"
        >
          {option.label}
          {option.count !== undefined && (
            <span className="text-caption tabular-nums opacity-80">{option.count}</span>
          )}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  )
}
