// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { ChevronsUpDown, X } from 'lucide-react'
import { useState } from 'react'

import { cn } from '../../../lib/utils'
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '../../../primitives/popover'
import { ComboboxList } from '../Combobox/ComboboxList'

import type { ComboboxOption, MultiSelectProps } from '../Combobox/Combobox.types'

/**
 * Combobox with chips: the first `maxVisibleChips` choices as removable chips, the rest as "+N".
 * Each chip's remove button has a 24×24px hit area and a name ("Remove Support").
 */
export default function MultiSelect({
  options,
  value,
  onValueChange,
  labels,
  maxVisibleChips = 3,
  onSearchChange,
  isLoading = false,
  isDisabled = false,
  className,
  ...aria
}: Readonly<MultiSelectProps>) {
  const [isOpen, setIsOpen] = useState(false)
  // Labels of chosen options that are no longer in the (async) results.
  const [known, setKnown] = useState<Record<string, ComboboxOption>>({})
  const optionOf = (optionValue: string) =>
    options.find((option) => option.value === optionValue) ?? known[optionValue]

  const visible = value.slice(0, maxVisibleChips)
  const hiddenCount = value.length - visible.length
  const remove = (optionValue: string) => {
    onValueChange(value.filter((v) => v !== optionValue))
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverAnchor asChild>
        <div
          className={cn(
            'border-input dark:bg-input/30 has-[button[role=combobox]:focus-visible]:border-ring has-[button[role=combobox]:focus-visible]:ring-ring flex min-h-9 w-full min-w-0 flex-wrap items-center gap-1 rounded-lg border bg-transparent p-1 has-[button[role=combobox]:focus-visible]:ring-1 pointer-coarse:min-h-11',
            aria['aria-invalid'] && 'border-destructive',
            isDisabled && 'cursor-not-allowed opacity-50',
            className,
          )}
        >
          {visible.map((optionValue) => {
            const label = optionOf(optionValue)?.label ?? optionValue
            return (
              <span
                key={optionValue}
                className="bg-surface-2 text-label text-foreground flex h-6 max-w-48 items-center rounded-md pl-2"
              >
                <span className="truncate">{label}</span>
                <button
                  type="button"
                  aria-label={labels.remove(label)}
                  disabled={isDisabled}
                  className="text-muted-foreground hover:text-foreground flex size-6 shrink-0 items-center justify-center rounded-md"
                  onClick={() => {
                    remove(optionValue)
                  }}
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              </span>
            )
          })}
          {hiddenCount > 0 && (
            <span className="bg-surface-2 text-label text-foreground-secondary flex h-6 items-center rounded-md px-2 tabular-nums">
              {labels.more(hiddenCount)}
            </span>
          )}
          <PopoverTrigger asChild>
            <button
              type="button"
              role="combobox"
              aria-expanded={isOpen}
              aria-haspopup="listbox"
              disabled={isDisabled}
              className="text-body flex h-6 min-w-24 flex-1 items-center gap-2 rounded-md px-2 text-left outline-none disabled:cursor-not-allowed"
              {...aria}
            >
              <span className="text-muted-foreground flex-1 truncate">
                {value.length === 0 ? labels.placeholder : labels.search}
              </span>
              <ChevronsUpDown aria-hidden className="text-muted-foreground size-4 shrink-0" />
            </button>
          </PopoverTrigger>
        </div>
      </PopoverAnchor>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-60 p-0">
        <ComboboxList
          options={options}
          labels={labels}
          isLoading={isLoading}
          onSearchChange={onSearchChange}
          isSelected={(optionValue) => value.includes(optionValue)}
          onSelect={(option) => {
            if (value.includes(option.value)) {
              remove(option.value)
              return
            }
            setKnown((current) => ({ ...current, [option.value]: option }))
            onValueChange([...value, option.value])
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
