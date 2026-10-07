// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { CHAT_CORRECTION_MAX_LENGTH } from '@surefy/contracts'
import { Field } from '@surefy/ui/components/Forms'
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

/** "Not helpful": an optional correction that can feed the organization's training datasets. */
export default function FeedbackDialog({
  isPending,
  onSubmit,
  onClose,
}: Readonly<{
  isPending: boolean
  onSubmit: (correction: string | undefined) => void
  onClose: () => void
}>) {
  const t = useTranslations('chat.thread.feedback')
  const [correction, setCorrection] = useState('')
  const text = correction.trim()

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit(text === '' ? undefined : text)
          }}
        >
          <DialogBody>
            <Field label={t('correction')} optionalLabel={t('optional')}>
              <Textarea
                rows={4}
                maxLength={CHAT_CORRECTION_MAX_LENGTH}
                value={correction}
                onChange={(event) => {
                  setCorrection(event.target.value)
                }}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" type="button" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="submit" isLoading={isPending}>
              {t('submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
