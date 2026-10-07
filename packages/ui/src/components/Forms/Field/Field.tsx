// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Slot } from 'radix-ui'
import { useId } from 'react'

import { FieldError, OptionalMark } from './FieldError'
import { cn } from '../../../lib/utils'
import { Label } from '../../../primitives/label'

import type { FieldProps } from './Field.types'

/**
 * Label above, help text below the label, the control, then the error. For forms built with
 * react-hook-form, use the `Form*` primitives instead; this is for controls outside a form
 * (filters, settings saved on change).
 */
export default function Field({
  label,
  optionalLabel,
  description,
  error,
  id,
  isLabelHidden = false,
  className,
  children,
}: Readonly<FieldProps>) {
  const generatedId = useId()
  const controlId = id ?? generatedId
  const descriptionId = description ? `${controlId}-description` : undefined
  const errorId = error ? `${controlId}-error` : undefined
  const describedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined
  return (
    <div data-slot="field" className={cn('flex flex-col gap-1.5', className)}>
      <Label
        htmlFor={controlId}
        className={cn('text-label text-foreground', isLabelHidden && 'sr-only')}
      >
        {label}
        {optionalLabel && <OptionalMark>{optionalLabel}</OptionalMark>}
      </Label>
      {description && (
        <p id={descriptionId} className="text-caption text-muted-foreground">
          {description}
        </p>
      )}
      <Slot.Root
        id={controlId}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
      >
        {children}
      </Slot.Root>
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  )
}
