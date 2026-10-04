// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useId } from 'react'

import { FieldError, OptionalMark } from './FieldError'
import { cn } from '../../../lib/utils'

import type { FieldSetProps } from './Field.types'

/** A labelled group of controls (radio group, checkboxes): a fieldset with a legend. */
export default function FieldSet({
  legend,
  optionalLabel,
  description,
  error,
  className,
  children,
}: Readonly<FieldSetProps>) {
  const id = useId()
  const descriptionId = description ? `${id}-description` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined
  return (
    <fieldset
      aria-describedby={describedBy}
      aria-invalid={error ? true : undefined}
      className={cn('flex min-w-0 flex-col gap-1.5', className)}
    >
      <legend className="text-label text-foreground flex items-center gap-2">
        {legend}
        {optionalLabel && <OptionalMark>{optionalLabel}</OptionalMark>}
      </legend>
      {description && (
        <p id={descriptionId} className="text-caption text-muted-foreground">
          {description}
        </p>
      )}
      <div className="mt-1.5 flex flex-col gap-3">{children}</div>
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </fieldset>
  )
}
