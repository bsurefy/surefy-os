// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useId, useState } from 'react'

import { Field } from '@surefy/ui/components/Forms'
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

import type { GuardReasonDialogProps } from './GuardReasonDialog.types'

/**
 * Confirmation tier T2 with a reason for the audit log (design/workspace/guard.md): turning off,
 * loosening or deleting a rule, loosening a data filter or the defaults. It states the impact,
 * asks for the reason only when the change needs one, and stays open with what was typed when the
 * save fails.
 */
export default function GuardReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  impact = [],
  isReasonRequired,
  labels,
  tone = 'primary',
  onConfirm,
  error,
}: Readonly<GuardReasonDialogProps>) {
  const ui = useUiLabels()
  const reasonId = useId()
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string>()
  const [isPending, setIsPending] = useState(false)

  const handleOpenChange = (next: boolean) => {
    if (isPending) return
    if (!next) {
      setReason('')
      setReasonError(undefined)
    }
    onOpenChange(next)
  }

  const handleConfirm = async () => {
    const trimmed = reason.trim()
    if (isReasonRequired && trimmed === '') {
      setReasonError(labels.reasonRequired)
      return
    }
    setIsPending(true)
    try {
      await onConfirm({ reason: trimmed === '' ? undefined : trimmed })
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
        {...(description ? {} : { 'aria-describedby': undefined })}
        onOpenAutoFocus={(event) => {
          if (!isReasonRequired) return
          event.preventDefault()
          document.getElementById(reasonId)?.focus()
        }}
        onEscapeKeyDown={(event) => {
          if (isPending || reason !== '') event.preventDefault()
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {(impact.length > 0 || isReasonRequired || error) && (
          <AlertDialogBody>
            {impact.length > 0 && (
              <ul className="text-body text-foreground flex list-disc flex-col gap-1 pl-5">
                {impact.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            )}
            {isReasonRequired && (
              <Field
                id={reasonId}
                label={labels.reason}
                description={labels.reasonHelp}
                error={reasonError}
              >
                <Textarea
                  value={reason}
                  onChange={(event) => {
                    setReason(event.target.value)
                    setReasonError(undefined)
                  }}
                />
              </Field>
            )}
            {error && (
              <p role="alert" className="text-body text-destructive">
                {error}
              </p>
            )}
          </AlertDialogBody>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="secondary" disabled={isPending}>
              {ui.cancel}
            </Button>
          </AlertDialogCancel>
          <Button
            variant={tone === 'destructive' ? 'destructive' : 'primary'}
            isLoading={isPending}
            onClick={() => {
              void handleConfirm()
            }}
          >
            {labels.confirm}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
