// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'
import { useId, useState } from 'react'

import { APPROVAL_DECISION_REASONS } from '@surefy/contracts'
import type { ApprovalDecisionReason } from '@surefy/contracts'
import { Field, SelectInput } from '@surefy/ui/components/Forms'
import { useUiLabels } from '@surefy/ui/lib/labels'
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@surefy/ui/primitives/alert-dialog'
import { Button } from '@surefy/ui/primitives/button'
import { Textarea } from '@surefy/ui/primitives/textarea'

import type { RejectDialogProps } from './RejectDialog.types'

/**
 * Rejecting an approval (insights.md): a reason is required (Wrong amount, Not eligible, Needs
 * more information, Wrong team, Other), and Other needs a note. The reason goes to the audit log.
 */
export default function RejectDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  error,
}: Readonly<RejectDialogProps>) {
  const t = useTranslations('insights.approvals.reject')
  const ui = useUiLabels()
  const noteId = useId()
  const [reason, setReason] = useState<ApprovalDecisionReason | ''>('')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<{ reason?: string; note?: string }>({})
  const [isPending, setIsPending] = useState(false)

  const handleOpenChange = (next: boolean) => {
    if (isPending) return
    if (!next) {
      setReason('')
      setNote('')
      setErrors({})
    }
    onOpenChange(next)
  }

  const handleConfirm = async () => {
    const trimmed = note.trim()
    if (!reason) {
      setErrors({ reason: t('reasonRequired') })
      return
    }
    if (reason === 'other' && trimmed === '') {
      setErrors({ note: t('noteRequired') })
      return
    }
    setIsPending(true)
    try {
      await onConfirm({ reason, note: trimmed === '' ? undefined : trimmed })
      setIsPending(false)
      handleOpenChange(false)
    } catch {
      // the caller shows why in `error`
      setIsPending(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent
        onEscapeKeyDown={(event) => {
          if (isPending) event.preventDefault()
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogBody>
          <Field label={t('reason')} error={errors.reason}>
            <SelectInput
              options={APPROVAL_DECISION_REASONS.map((value) => ({
                value,
                label: t(`reasons.${value}`),
              }))}
              value={reason}
              placeholder={t('reasonPlaceholder')}
              onValueChange={(value) => {
                setReason(value)
                setErrors({})
              }}
            />
          </Field>
          <Field
            id={noteId}
            label={t('note')}
            optionalLabel={reason === 'other' ? undefined : t('optional')}
            description={t('noteHelp')}
            error={errors.note}
          >
            <Textarea
              value={note}
              onChange={(event) => {
                setNote(event.target.value)
                setErrors((current) => ({ ...current, note: undefined }))
              }}
            />
          </Field>
          {error && (
            <p role="alert" className="text-body text-destructive">
              {error}
            </p>
          )}
        </AlertDialogBody>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="secondary" disabled={isPending}>
              {ui.cancel}
            </Button>
          </AlertDialogCancel>
          <Button
            variant="destructive"
            isLoading={isPending}
            onClick={() => {
              void handleConfirm()
            }}
          >
            {t('confirm')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
