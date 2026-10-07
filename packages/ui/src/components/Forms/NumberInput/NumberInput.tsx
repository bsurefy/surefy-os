// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Minus, Plus } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'

import { cn } from '../../../lib/utils'
import { frameClassName, frameInputClassName } from '../frame'
import { clamp, parseNumber } from './parseNumber'

import type { NumberInputProps } from './NumberInput.types'

const stepButtonClassName =
  'text-muted-foreground hover:bg-surface-2 hover:text-foreground flex size-7 shrink-0 items-center justify-center rounded-md disabled:pointer-events-none disabled:opacity-50'

/**
 * Number, currency or percent input: unit adornments, locale formatting when not editing, min/max
 * applied on blur, arrow keys and an optional stepper.
 */
export default function NumberInput({
  value,
  onValueChange,
  min,
  max,
  step = 1,
  prefix,
  suffix,
  locale,
  formatOptions,
  stepper,
  className,
  disabled,
  onFocus,
  onBlur,
  onKeyDown,
  ...rest
}: Readonly<NumberInputProps>) {
  // The text being edited; null while the field is not focused (the formatted value shows).
  const [draft, setDraft] = useState<string | null>(null)
  const display = new Intl.NumberFormat(locale, formatOptions)
  const plain = new Intl.NumberFormat(locale, { ...formatOptions, useGrouping: false })
  const shown = draft ?? (value === null ? '' : display.format(value))

  const commit = (next: number | null) => {
    onValueChange(next === null ? null : clamp(next, min, max))
  }
  const stepBy = (direction: 1 | -1) => {
    const next = clamp((value ?? min ?? 0) + direction * step, min, max)
    commit(next)
    if (draft !== null) setDraft(plain.format(next))
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event)
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      stepBy(event.key === 'ArrowUp' ? 1 : -1)
    }
  }

  return (
    <div className={cn(frameClassName, 'gap-1 pr-1', !stepper && 'pr-0', className)}>
      {prefix && <span className="text-muted-foreground text-body pl-3">{prefix}</span>}
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        disabled={disabled}
        value={shown}
        className={cn(frameInputClassName, 'tabular-nums', prefix && 'pl-0', suffix && 'pr-0')}
        onFocus={(event) => {
          setDraft(value === null ? '' : plain.format(value))
          onFocus?.(event)
        }}
        onChange={(event) => {
          setDraft(event.target.value)
        }}
        onBlur={(event) => {
          const parsed = parseNumber(draft ?? '', locale)
          // Junk keeps the last good value instead of clearing what was there.
          if (!Number.isNaN(parsed)) commit(parsed)
          setDraft(null)
          onBlur?.(event)
        }}
        onKeyDown={handleKeyDown}
        {...rest}
      />
      {suffix && <span className="text-muted-foreground text-body pr-3">{suffix}</span>}
      {stepper && (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-label={stepper.decrementLabel}
            disabled={Boolean(disabled) || (min !== undefined && value !== null && value <= min)}
            className={stepButtonClassName}
            onClick={() => {
              stepBy(-1)
            }}
          >
            <Minus aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label={stepper.incrementLabel}
            disabled={Boolean(disabled) || (max !== undefined && value !== null && value >= max)}
            className={stepButtonClassName}
            onClick={() => {
              stepBy(1)
            }}
          >
            <Plus aria-hidden className="size-4" />
          </button>
        </>
      )}
    </div>
  )
}
