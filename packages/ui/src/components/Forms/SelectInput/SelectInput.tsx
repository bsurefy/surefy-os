// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { cn } from '../../../lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../primitives/select'

import type { SelectInputProps } from './SelectInput.types'

/**
 * Radix Select for short lists, with the id and aria props on the trigger so `Field` can label it
 * (the Select root renders no element of its own).
 */
export default function SelectInput<T extends string>({
  options,
  value,
  onValueChange,
  placeholder,
  isDisabled = false,
  className,
  ...aria
}: Readonly<SelectInputProps<T>>) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        onValueChange(next as T)
      }}
      disabled={isDisabled}
    >
      <SelectTrigger className={cn('w-full', className)} {...aria}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} disabled={option.isDisabled}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
