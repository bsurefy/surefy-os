// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { CircleAlert } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'

import { cn } from '../../../lib/utils'

import type { ErrorSummaryProps } from './ErrorSummary.types'

/**
 * The list of problems at the top of a form after a submit. It takes focus when it mounts, so
 * render it with `key={submitCount}` to move focus to it on every failed submit.
 */
export default function ErrorSummary({
  title,
  errors,
  formErrors = [],
  className,
}: Readonly<ErrorSummaryProps>) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const hasErrors = errors.length > 0 || formErrors.length > 0

  useEffect(() => {
    ref.current?.focus()
  }, [])

  if (!hasErrors) return null

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="region"
      aria-labelledby={titleId}
      className={cn(
        'border-destructive/40 bg-destructive-soft text-destructive-soft-foreground flex gap-3 rounded-lg border p-4',
        className,
      )}
    >
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="flex min-w-0 flex-col gap-2">
        <h2 id={titleId} className="text-section-title">
          {title}
        </h2>
        <ul className="text-body flex list-disc flex-col gap-1 pl-4">
          {formErrors.map((message) => (
            <li key={message}>{message}</li>
          ))}
          {errors.map(({ fieldId, message }) => (
            <li key={fieldId}>
              <a
                href={`#${fieldId}`}
                className="underline underline-offset-2"
                onClick={(event) => {
                  const field = document.getElementById(fieldId)
                  if (!field) return
                  event.preventDefault()
                  field.focus()
                }}
              >
                {message}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
