// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useId, useRef, useState } from 'react'

import { useUiLabels } from '../../../lib/labels'
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../primitives/alert-dialog'
import { Button } from '../../../primitives/button'
import { Input } from '../../../primitives/input'
import { Textarea } from '../../../primitives/textarea'
import Field from '../../Forms/Field'

import type { ConfirmDialogProps } from './ConfirmDialog.types'

/**
 * Confirmation tiers T2 and T3. The copy states the consequence; the destructive button is never
 * focused first (T2 focuses Cancel, T3 the reason), and Esc does not close a T3 dialog once
 * something was typed.
 */
export default function ConfirmDialog({
  open,
  onOpenChange,
  tier,
  title,
  description,
  impact = [],
  labels,
  confirmationText = '',
  tone = 'destructive',
  onConfirm,
  error,
}: Readonly<ConfirmDialogProps>) {
  const ui = useUiLabels()
  const reasonRef = useRef<HTMLTextAreaElement>(null)
  const reasonId = useId()
  const typedId = useId()
  const [reason, setReason] = useState('')
  const [typed, setTyped] = useState('')
  const [isPending, setIsPending] = useState(false)
  const [errors, setErrors] = useState<{ reason?: string; typed?: string }>({})
  const isTyped = tier === 'T3'

  const handleOpenChange = (next: boolean) => {
    if (isPending) return
    if (!next) {
      setReason('')
      setTyped('')
      setErrors({})
    }
    onOpenChange(next)
  }

  const handleConfirm = async () => {
    if (isTyped) {
      const nextErrors = {
        reason: reason.trim() ? undefined : labels.reasonRequired,
        typed:
          typed.trim() === confirmationText ? undefined : labels.typeMismatch?.(confirmationText),
      }
      setErrors(nextErrors)
      if (nextErrors.reason ?? nextErrors.typed) return
    }
    setIsPending(true)
    try {
      await onConfirm({ reason: isTyped ? reason.trim() : undefined })
      setIsPending(false)
      handleOpenChange(false)
    } catch {
      // The caller shows why in `error`; the dialog stays open with what was typed.
      setIsPending(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent
        {...(description ? {} : { 'aria-describedby': undefined })}
        onOpenAutoFocus={(event) => {
          if (!isTyped) return
          event.preventDefault()
          reasonRef.current?.focus()
        }}
        onEscapeKeyDown={(event) => {
          if (isPending || (isTyped && (reason || typed))) event.preventDefault()
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {(impact.length > 0 || isTyped || error) && (
          <AlertDialogBody>
            {impact.length > 0 && (
              <ul className="text-body text-foreground flex list-disc flex-col gap-1 pl-5">
                {impact.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            )}
            {isTyped && (
              <>
                <Field
                  id={reasonId}
                  label={labels.reason}
                  description={labels.reasonHelp}
                  error={errors.reason}
                >
                  <Textarea
                    ref={reasonRef}
                    value={reason}
                    onChange={(event) => {
                      setReason(event.target.value)
                    }}
                  />
                </Field>
                <Field
                  id={typedId}
                  label={labels.typeToConfirm?.(confirmationText)}
                  error={errors.typed}
                >
                  <Input
                    autoComplete="off"
                    spellCheck={false}
                    value={typed}
                    onChange={(event) => {
                      setTyped(event.target.value)
                    }}
                  />
                </Field>
              </>
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
              {labels.cancel ?? ui.cancel}
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
