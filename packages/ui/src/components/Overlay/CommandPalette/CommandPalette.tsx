// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useState } from 'react'

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '../../../primitives/command'

import type { CommandPaletteGroup, CommandPaletteProps } from './CommandPalette.types'

/**
 * Search and commands for the current portal: recent items before typing, results grouped by
 * type, keyboard navigable, "No results for 'x'" with a suggestion.
 */
export default function CommandPalette({
  open,
  onOpenChange,
  labels,
  groups,
  recent,
  onQueryChange,
  isLoading = false,
  footer,
}: Readonly<CommandPaletteProps>) {
  const [query, setQuery] = useState('')
  const shown: CommandPaletteGroup[] = query === '' && recent ? [recent, ...groups] : groups

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setQuery('')
      onQueryChange?.('')
    }
    onOpenChange(next)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={labels.title}
      description={labels.description}
      shouldFilter={!onQueryChange}
    >
      <CommandInput
        placeholder={labels.placeholder}
        value={query}
        onValueChange={(next) => {
          setQuery(next)
          onQueryChange?.(next)
        }}
      />
      <CommandList className="max-h-[min(400px,60dvh)]">
        {isLoading ? (
          <div role="status" className="text-body text-muted-foreground py-6 text-center">
            {labels.loading}
          </div>
        ) : (
          <CommandEmpty>{labels.empty(query)}</CommandEmpty>
        )}
        {!isLoading &&
          shown.map((group) => (
            <CommandGroup key={group.heading} heading={group.heading}>
              {group.items.map((item) => {
                const Icon = item.icon
                return (
                  <CommandItem
                    key={`${group.heading}-${item.id}`}
                    value={`${group.heading}-${item.id}`}
                    keywords={[item.label, item.description ?? '', ...(item.keywords ?? [])]}
                    onSelect={() => {
                      handleOpenChange(false)
                      item.onSelect()
                    }}
                  >
                    {Icon && <Icon aria-hidden />}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{item.label}</span>
                      {item.description && (
                        <span className="text-caption text-muted-foreground truncate">
                          {item.description}
                        </span>
                      )}
                    </span>
                    {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          ))}
      </CommandList>
      {footer && (
        <div className="border-border text-caption text-muted-foreground border-t px-3 py-2">
          {footer}
        </div>
      )}
    </CommandDialog>
  )
}
