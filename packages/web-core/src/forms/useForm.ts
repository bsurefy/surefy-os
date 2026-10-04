// SPDX-License-Identifier: AGPL-3.0-only
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm as useHookForm, type FieldValues, type UseFormProps } from 'react-hook-form'

import type { z } from 'zod'

export interface UseZodFormProps<
  Input extends FieldValues,
  Output extends FieldValues,
> extends Omit<UseFormProps<Input, unknown, Output>, 'resolver'> {
  /** The form's Zod schema: `defaultValues` are checked against its input, `handleSubmit` gets its output. */
  schema: z.ZodType<Output, Input>
}

/**
 * The house form hook, the only place that wires `zodResolver`. Fields validate once they are left
 * (`onTouched`), then live; a failed submit does not focus the first invalid field, because focus
 * goes to the error summary.
 */
export function useForm<Input extends FieldValues, Output extends FieldValues>({
  schema,
  mode = 'onTouched',
  shouldFocusError = false,
  ...props
}: UseZodFormProps<Input, Output>) {
  return useHookForm<Input, unknown, Output>({
    ...props,
    mode,
    shouldFocusError,
    resolver: zodResolver(schema),
  })
}
