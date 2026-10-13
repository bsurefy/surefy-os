// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { PII_ACTIONS } from '@surefy/contracts'
import type { PiiAction } from '@surefy/contracts'
import { Banner } from '@surefy/ui/components/Feedback'
import { Combobox, Field, SegmentedControl } from '@surefy/ui/components/Forms'
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
import { Form, FormField } from '@surefy/ui/primitives/form'
import { Textarea } from '@surefy/ui/primitives/textarea'

import { EXCEPTION_FORM_ID } from '../DataFilters.constants'
import { useExceptionDialogController } from './ExceptionDialog.controller'

interface ExceptionDialogProps {
  /** The personal-data type's name. */
  typeName: string
  currentAction: PiiAction
  onAdd: (input: {
    teamId: string
    action: PiiAction
    reason: string
    teamName: string
  }) => Promise<unknown>
  onClose: () => void
}

/**
 * An exception for one team (T2): the team handles this type differently from the organization,
 * which is recorded with the reason.
 */
export default function ExceptionDialog({
  typeName,
  currentAction,
  onAdd,
  onClose,
}: Readonly<ExceptionDialogProps>) {
  const c = useExceptionDialogController({ currentAction, onAdd })
  const { t, form } = c

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title', { type: typeName })}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id={EXCEPTION_FORM_ID} noValidate onSubmit={c.onSubmit}>
            <DialogBody className="flex flex-col gap-4">
              {c.formError && <Banner tone="destructive" title={c.formError} isAnnounced />}
              <FormField
                control={form.control}
                name="teamId"
                render={({ field, fieldState }) => (
                  <Field label={t('team')} error={fieldState.error?.message}>
                    <Combobox
                      options={c.teamOptions}
                      value={field.value === '' ? null : field.value}
                      onValueChange={(value) => {
                        field.onChange(value ?? '')
                      }}
                      isLoading={c.isLoadingTeams}
                      labels={{
                        placeholder: t('teamPlaceholder'),
                        search: t('teamSearch'),
                        empty: t('teamEmpty'),
                      }}
                    />
                  </Field>
                )}
              />
              <FormField
                control={form.control}
                name="action"
                render={({ field }) => (
                  <Field label={t('action')}>
                    <SegmentedControl
                      label={t('action')}
                      options={PII_ACTIONS.map((value) => ({ value, label: c.tActions(value) }))}
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                  </Field>
                )}
              />
              <FormField
                control={form.control}
                name="reason"
                render={({ field, fieldState }) => (
                  <Field
                    label={t('reason')}
                    description={t('reasonHelp')}
                    error={fieldState.error?.message}
                  >
                    <Textarea {...field} />
                  </Field>
                )}
              />
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" type="button" onClick={onClose}>
                {t('cancel')}
              </Button>
              <Button type="submit" isLoading={c.isPending}>
                {t('save')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
