// SPDX-License-Identifier: AGPL-3.0-only
export interface SelectInputOption<T extends string = string> {
  value: T
  label: string
  isDisabled?: boolean
}

export interface SelectInputProps<T extends string = string> {
  /** Up to 10 options; longer or searchable lists use Combobox. */
  options: SelectInputOption<T>[]
  value: T | undefined
  onValueChange: (value: T) => void
  /** Trigger text when nothing is selected. Translated text. */
  placeholder?: string
  isDisabled?: boolean
  /** Set by `Field`; goes to the trigger. */
  id?: string
  'aria-label'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  className?: string
}
