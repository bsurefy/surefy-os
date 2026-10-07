// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Check } from 'lucide-react'
import { useState } from 'react'

import { cn } from '../../../lib/utils'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../../../primitives/command'

import type { ComboboxLabels, ComboboxOption } from './Combobox.types'

interface ComboboxListProps {
  options: ComboboxOption[]
  labels: ComboboxLabels
  isSelected: (value: string) => boolean
  onSelect: (option: ComboboxOption) => void
  onSearchChange?: (query: string) => void
  isLoading: boolean
}

/** Search box and options shared by Combobox and MultiSelect. */
export function ComboboxList({
  options,
  labels,
  isSelected,
  onSelect,
  onSearchChange,
  isLoading,
}: Readonly<ComboboxListProps>) {
  const [query, setQuery] = useState('')
  return (
    <Command shouldFilter={!onSearchChange}>
      <CommandInput
        placeholder={labels.search}
        value={query}
        onValueChange={(next) => {
          setQuery(next)
          onSearchChange?.(next)
        }}
      />
      <CommandList>
        {isLoading ? (
          <div role="status" className="text-caption text-muted-foreground py-6 text-center">
            {labels.loading}
          </div>
        ) : (
          <CommandEmpty>{labels.empty}</CommandEmpty>
        )}
        {!isLoading && (
          <CommandGroup>
            {options.map((option) => {
              const selected = isSelected(option.value)
              return (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  keywords={[option.label, option.description ?? '']}
                  disabled={option.isDisabled}
                  aria-selected={selected}
                  data-checked={selected}
                  onSelect={() => {
                    onSelect(option)
                  }}
                >
                  {option.icon}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{option.label}</span>
                    {option.description && (
                      <span className="text-caption text-muted-foreground truncate">
                        {option.description}
                      </span>
                    )}
                  </span>
                  <Check
                    aria-hidden
                    className={cn('text-primary size-4', !selected && 'invisible')}
                  />
                </CommandItem>
              )
            })}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  )
}
