// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react'

export interface ComboboxOption {
  value: string
  label: string
  /** Second line ("owner@acme.com", "OpenAI · 128k context"). */
  description?: string
  icon?: ReactNode
  isDisabled?: boolean
}

export interface ComboboxLabels {
  /** Trigger text when nothing is selected ("Select a model"). */
  placeholder: string
  /** Placeholder of the search box ("Search models"). */
  search: string
  /** "No models match". */
  empty: string
  /** "Searching…", shown while `isLoading`. */
  loading?: string
}

interface ComboboxBaseProps {
  options: ComboboxOption[]
  labels: ComboboxLabels
  /**
   * Async search: called with the query as the person types; `options` are then the results and
   * are not filtered again here. Without it, options are filtered locally.
   */
  onSearchChange?: (query: string) => void
  isLoading?: boolean
  isDisabled?: boolean
  /** Set by `Field`. */
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  className?: string
}

export interface ComboboxProps extends ComboboxBaseProps {
  value: string | null
  onValueChange: (value: string | null) => void
}

export interface MultiSelectLabels extends ComboboxLabels {
  /** Name of a chip's remove button: (label) => "Remove Support". */
  remove: (label: string) => string
  /** The overflow chip: (count) => "+3". */
  more: (count: number) => string
}

export interface MultiSelectProps extends Omit<ComboboxBaseProps, 'labels'> {
  value: string[]
  onValueChange: (value: string[]) => void
  labels: MultiSelectLabels
  /** Chips shown before "+N". Default 3. */
  maxVisibleChips?: number
}
