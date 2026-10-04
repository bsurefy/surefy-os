// SPDX-License-Identifier: AGPL-3.0-only
import type { LucideIcon } from 'lucide-react'

export interface SegmentedControlOption<T extends string = string> {
  value: T
  label: string
  icon?: LucideIcon
  /** Shows only the icon; the label stays as its accessible name. */
  isIconOnly?: boolean
  isDisabled?: boolean
}

export interface SegmentedControlProps<T extends string = string> {
  /** Accessible name of the group ("View"). Translated text. */
  label: string
  /** 2–5 mutually exclusive filters or modes; not for navigation (use Tabs). */
  options: SegmentedControlOption<T>[]
  value: T
  onValueChange: (value: T) => void
  size?: 'sm' | 'md'
  className?: string
}
