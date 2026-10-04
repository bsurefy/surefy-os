// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Check, Copy, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useUiLabels } from '../../../lib/labels'
import { cn } from '../../../lib/utils'
import { Button } from '../../../primitives/button'

import type { ErrorStateProps } from './ErrorState.types'

/**
 * A region that failed to load: what failed, what still works, Retry, and the request ID for
 * support. Never shows stack traces or raw responses.
 */
export default function ErrorState({
  title,
  message,
  reference,
  details,
  onRetry,
  retryLabel,
  secondaryAction,
  size = 'md',
  headingLevel = 2,
  className,
}: Readonly<ErrorStateProps>) {
  const labels = useUiLabels()
  const [isCopied, setIsCopied] = useState(false)
  const Heading = headingLevel === 2 ? 'h2' : 'h3'
  const meta = [details, reference].filter(Boolean).join(' · ')

  useEffect(() => {
    if (!isCopied) return
    const timer = globalThis.setTimeout(() => {
      setIsCopied(false)
    }, 2000)
    return () => {
      globalThis.clearTimeout(timer)
    }
  }, [isCopied])

  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 text-center',
        size === 'md' ? 'py-12' : 'py-6',
        className,
      )}
    >
      <span className="bg-destructive-soft text-destructive flex size-10 items-center justify-center rounded-lg">
        <TriangleAlert aria-hidden className="size-5" />
      </span>
      <div className="flex max-w-md flex-col gap-1">
        {title && <Heading className="text-section-title text-foreground">{title}</Heading>}
        <p className="text-body text-foreground-secondary">{message}</p>
      </div>
      {(onRetry ?? secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {onRetry && (
            <Button variant="secondary" onClick={onRetry}>
              {retryLabel ?? labels.retry}
            </Button>
          )}
          {secondaryAction}
        </div>
      )}
      {meta && (
        <p className="text-caption text-muted-foreground flex items-center gap-1 font-mono">
          {meta}
          {reference && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={isCopied ? labels.copied : labels.copy}
              onClick={() => {
                void navigator.clipboard.writeText(meta).then(() => {
                  setIsCopied(true)
                })
              }}
            >
              {isCopied ? <Check aria-hidden /> : <Copy aria-hidden />}
            </Button>
          )}
        </p>
      )}
    </div>
  )
}
