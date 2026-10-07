// SPDX-License-Identifier: AGPL-3.0-only
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export interface CommandPaletteItem {
  id: string
  label: string
  /** Second line: the object's type or place ("Agent · Support"). */
  description?: string
  icon?: LucideIcon
  /** Shown on the right ("⌘N"). */
  shortcut?: string
  /** Extra words that match this item. */
  keywords?: string[]
  onSelect: () => void
}

export interface CommandPaletteGroup {
  /** "Agents", "Actions", "Recent". Translated text. */
  heading: string
  items: CommandPaletteItem[]
}

export interface CommandPaletteLabels {
  /** Dialog name for screen readers ("Search and commands"). */
  title: string
  description: string
  /** "Search agents, chats, people or actions". */
  placeholder: string
  /** (query) => "No results for 'refund'. Try a person's email or an agent name." */
  empty: (query: string) => string
  /** "Searching…". */
  loading?: string
}

export interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  labels: CommandPaletteLabels
  /** Results, grouped by type; only what the person can use. */
  groups: CommandPaletteGroup[]
  /** Shown before typing (recent items). */
  recent?: CommandPaletteGroup
  /** Server search: the query goes to the caller, and `groups` are the results (no local filter). */
  onQueryChange?: (query: string) => void
  isLoading?: boolean
  /** Footer note ("Searches in the Console are recorded in the audit log"). */
  footer?: ReactNode
}
