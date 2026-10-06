// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { ChevronsUpDown } from 'lucide-react'
import { useState } from 'react'

import { ComboboxList } from './ComboboxList'
import { cn } from '../../../lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '../../../primitives/popover'

import type { ComboboxOption, ComboboxProps } from './Combobox.types'

export const comboboxTriggerClassName =
  'border-input dark:bg-input/30 text-body flex h-9 w-full min-w-0 items-center gap-2 rounded-lg border bg-transparent px-3 text-left pointer-coarse:h-11 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:ring-destructive'

/** Searchable select for long lists (organizations, users, models, teams), with async search. */
export default function Combobox({
  options,
  value,
  onValueChange,
  labels,
  onSearchChange,
  isLoading = false,
  isDisabled = false,
  className,
  ...aria
}: Readonly<ComboboxProps>) {
  const [isOpen, setIsOpen] = useState(false)
  // Async results change as the person types; keep the chosen option to show its label.
  const [picked, setPicked] = useState<ComboboxOption | null>(null)
  const selected =
    options.find((option) => option.value === value) ??
    (picked !== null && picked.value === value ? picked : null)

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          disabled={isDisabled}
          className={cn(comboboxTriggerClassName, className)}
          {...aria}
        >
          {selected?.icon}
          <span className={cn('flex-1 truncate', !selected && 'text-muted-foreground')}>
            {selected?.label ?? labels.placeholder}
          </span>
          <ChevronsUpDown aria-hidden className="text-muted-foreground size-4 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-60 p-0">
        <ComboboxList
          options={options}
          labels={labels}
          isLoading={isLoading}
          onSearchChange={onSearchChange}
          isSelected={(optionValue) => optionValue === value}
          onSelect={(option) => {
            setPicked(option)
            onValueChange(option.value)
            setIsOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
