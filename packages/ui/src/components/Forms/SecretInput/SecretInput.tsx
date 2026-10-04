// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'

import { cn } from '../../../lib/utils'
import { frameClassName, frameInputClassName } from '../frame'

import type { SecretInputProps } from './SecretInput.types'

/** Masked input for API keys and passwords. "Show" works only while the field has focus. */
export default function SecretInput({
  labels,
  action,
  className,
  disabled,
  ...rest
}: Readonly<SecretInputProps>) {
  const [isShown, setIsShown] = useState(false)
  return (
    <div className={cn('flex w-full items-center gap-2', className)}>
      <div
        className={cn(frameClassName, 'pr-1')}
        onBlur={(event) => {
          // Hide again once focus leaves the field and its toggle.
          if (!event.currentTarget.contains(event.relatedTarget)) setIsShown(false)
        }}
      >
        <input
          type={isShown ? 'text' : 'password'}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          className={cn(frameInputClassName, 'font-mono')}
          {...rest}
        />
        <button
          type="button"
          aria-pressed={isShown}
          aria-label={isShown ? labels.hide : labels.show}
          disabled={disabled}
          className="text-muted-foreground hover:bg-surface-2 hover:text-foreground flex size-7 shrink-0 items-center justify-center rounded-md disabled:opacity-50"
          onClick={() => {
            setIsShown((shown) => !shown)
          }}
        >
          {isShown ? (
            <EyeOff aria-hidden className="size-4" />
          ) : (
            <Eye aria-hidden className="size-4" />
          )}
        </button>
      </div>
      {action}
    </div>
  )
}
