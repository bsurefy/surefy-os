// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'

import { maskSecrets } from './maskSecrets'
import { cn } from '../../../lib/utils'
import { Button } from '../../../primitives/button'

import type { CodeBlockProps } from './CodeBlock.types'

/** Mono 13/20 on `surface-2`, with a language label and a copy button. Secrets are masked. */
export default function CodeBlock({
  code,
  language,
  labels,
  shouldMaskSecrets = true,
  maxHeight = 400,
  className,
}: Readonly<CodeBlockProps>) {
  const [isCopied, setIsCopied] = useState(false)
  const shown = shouldMaskSecrets ? maskSecrets(code) : code

  useEffect(() => {
    if (!isCopied) return
    const timer = globalThis.setTimeout(() => {
      setIsCopied(false)
    }, 2000)
    return () => {
      globalThis.clearTimeout(timer)
    }
  }, [isCopied])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shown)
    setIsCopied(true)
  }

  return (
    <div className={cn('border-border bg-surface-2 overflow-hidden rounded-lg border', className)}>
      <div className="border-border flex h-9 items-center justify-between border-b pr-1 pl-3">
        <span className="text-caption text-muted-foreground font-mono">{language}</span>
        <Button
          variant="ghost"
          size="sm"
          icon={isCopied ? Check : Copy}
          onClick={() => {
            void handleCopy()
          }}
        >
          <span aria-live="polite">{isCopied ? labels.copied : labels.copy}</span>
        </Button>
      </div>
      {/* Focusable so keyboard users can scroll long code. */}
      <pre
        tabIndex={0}
        className="text-code text-foreground overflow-auto p-3"
        style={{ maxHeight }}
      >
        <code>{shown}</code>
      </pre>
    </div>
  )
}
