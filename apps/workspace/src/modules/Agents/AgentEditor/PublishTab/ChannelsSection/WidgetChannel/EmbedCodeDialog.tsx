// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Check, Copy } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Banner } from '@surefy/ui/components/Feedback'
import { Button } from '@surefy/ui/primitives/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@surefy/ui/primitives/dialog'
import { Textarea } from '@surefy/ui/primitives/textarea'

const COPIED_RESET_MS = 2000

/**
 * The widget's embed code with its token, shown once (website-widget.md §1). Closing before
 * copying asks first: the token cannot be shown again, only replaced.
 */
export default function EmbedCodeDialog({
  snippet,
  onDone,
}: Readonly<{ snippet: string; onDone: () => void }>) {
  const t = useTranslations('agents.editor.publish.channels.widget.embed')
  const [isCopied, setIsCopied] = useState(false)
  const [hasCopied, setHasCopied] = useState(false)
  const [isConfirmingClose, setIsConfirmingClose] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(snippet)
    setIsCopied(true)
    setHasCopied(true)
    globalThis.setTimeout(() => {
      setIsCopied(false)
    }, COPIED_RESET_MS)
  }

  const requestClose = () => {
    if (hasCopied) onDone()
    else setIsConfirmingClose(true)
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) requestClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('warning')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <p className="text-body text-foreground">{t('howTo')}</p>
          <Textarea
            readOnly
            rows={3}
            value={snippet}
            aria-label={t('codeLabel')}
            className="text-code font-mono"
            onFocus={(event) => {
              event.currentTarget.select()
            }}
          />
          <div>
            <Button
              variant="secondary"
              icon={isCopied ? Check : Copy}
              onClick={() => {
                void copy()
              }}
            >
              {isCopied ? t('copied') : t('copy')}
            </Button>
          </div>
          {isConfirmingClose && (
            <Banner
              tone="warning"
              title={t('closeWithoutCopying.title')}
              description={t('closeWithoutCopying.description')}
              isAnnounced
              action={
                <span className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setIsConfirmingClose(false)
                    }}
                  >
                    {t('closeWithoutCopying.keep')}
                  </Button>
                  <Button variant="destructive" size="sm" onClick={onDone}>
                    {t('closeWithoutCopying.close')}
                  </Button>
                </span>
              }
            />
          )}
        </DialogBody>
        <DialogFooter>
          <Button onClick={requestClose}>{t('done')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
