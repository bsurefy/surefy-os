// SPDX-License-Identifier: AGPL-3.0-only
export interface FilterChipOption<T extends string = string> {
  value: T
  label: string
  /** Matching rows; shown after the label. */
  count?: number
  isDisabled?: boolean
}

export interface FilterChipsProps<T extends string = string> {
  /** Accessible name of the group ("Status"). Translated text. */
  label: string
  /** One chip per value; the first is usually "All". */
  options: FilterChipOption<T>[]
  value: T
  onValueChange: (value: T) => void
  className?: string
}
