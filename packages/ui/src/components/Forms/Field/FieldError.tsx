// SPDX-License-Identifier: AGPL-3.0-only
import { CircleAlert } from 'lucide-react'

import { cn } from '../../../lib/utils'

import type { FieldErrorProps } from './Field.types'

/** The message below an invalid field: what is wrong and how to fix it. */
export function FieldError({ id, className, children }: Readonly<FieldErrorProps>) {
  return (
    <p id={id} className={cn('text-caption text-destructive flex items-start gap-1', className)}>
      <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

/** "(optional)" after a label. */
export function OptionalMark({ children }: Readonly<{ children: string }>) {
  return <span className="text-muted-foreground font-normal">{children}</span>
}
