// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Check, Copy } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { CodeBlock } from '@surefy/ui/components/DataDisplay'
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
import { Input } from '@surefy/ui/primitives/input'

import { buildCurlExample, getApiBaseUrl } from '../ApiKeysSettings.utils'

const COPIED_RESET_MS = 2000

/**
 * The new key, shown once: a read-only field with Copy, the warning, and a call to paste. Closing
 * before copying asks first, because the key cannot be shown again.
 */
export default function CreatedKey({
  orgId,
  name,
  secret,
  onDone,
}: Readonly<{ orgId: string; name: string; secret: string; onDone: () => void }>) {
  const t = useTranslations('settings.apiKeys.created')
  const [isCopied, setIsCopied] = useState(false)
  const [hasCopied, setHasCopied] = useState(false)
  const [isConfirmingClose, setIsConfirmingClose] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(secret)
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
          <DialogTitle>{t('title', { name })}</DialogTitle>
          <DialogDescription>{t('warning')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={secret}
              aria-label={t('keyLabel')}
              className="text-code font-mono"
              onFocus={(event) => {
                event.currentTarget.select()
              }}
            />
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
          <div className="flex flex-col gap-2">
            <p className="text-label">{t('example')}</p>
            <CodeBlock
              code={buildCurlExample(getApiBaseUrl(globalThis.location.origin), orgId, secret)}
              language="bash"
              labels={{ copy: t('copyExample'), copied: t('copied') }}
              shouldMaskSecrets={false}
            />
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
