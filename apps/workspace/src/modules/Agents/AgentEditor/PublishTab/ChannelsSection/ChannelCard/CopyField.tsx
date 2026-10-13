// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Check, Copy } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId, useState } from 'react'

import { Button } from '@surefy/ui/primitives/button'
import { Input } from '@surefy/ui/primitives/input'

const COPIED_RESET_MS = 2000

/** A value to paste somewhere else (a webhook address, a verify token), with Copy. */
export default function CopyField({ label, value }: Readonly<{ label: string; value: string }>) {
  const t = useTranslations('agents.editor.publish.channels')
  const id = useId()
  const [isCopied, setIsCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(value)
    setIsCopied(true)
    globalThis.setTimeout(() => {
      setIsCopied(false)
    }, COPIED_RESET_MS)
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-label text-foreground">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          readOnly
          value={value}
          className="text-code font-mono"
          onFocus={(event) => {
            event.currentTarget.select()
          }}
        />
        <Button
          variant="secondary"
          size="sm"
          icon={isCopied ? Check : Copy}
          aria-label={t('copyValue', { action: isCopied ? t('copied') : t('copy'), label })}
          onClick={() => {
            void copy()
          }}
        >
          {isCopied ? t('copied') : t('copy')}
        </Button>
      </div>
    </div>
  )
}
