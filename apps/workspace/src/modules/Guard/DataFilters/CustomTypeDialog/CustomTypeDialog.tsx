// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { PII_ACTIONS } from '@surefy/contracts'
import type { DataFilterTypeDto, PiiAction } from '@surefy/contracts'
import { Banner } from '@surefy/ui/components/Feedback'
import { Field, SegmentedControl } from '@surefy/ui/components/Forms'
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
import { Input } from '@surefy/ui/primitives/input'

import { CUSTOM_TYPE_FORM_ID } from '../DataFilters.constants'
import { useCustomTypeDialogController } from './CustomTypeDialog.controller'

interface CustomTypeDialogProps {
  line: DataFilterTypeDto | null
  onSave: (input: { label: string; pattern: string; action: PiiAction }) => Promise<unknown>
  onClose: () => void
}

/** Add or edit a custom personal-data type: it saves at once, as it only adds protection. */
export default function CustomTypeDialog({
  line,
  onSave,
  onClose,
}: Readonly<CustomTypeDialogProps>) {
  const c = useCustomTypeDialogController({ line, onSave })
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
          <DialogTitle>
            {line ? t('editTitle', { label: line.customLabel ?? '' }) : t('addTitle')}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id={CUSTOM_TYPE_FORM_ID} noValidate onSubmit={c.onSubmit}>
            <DialogBody className="flex flex-col gap-4">
              {c.formError && <Banner tone="destructive" title={c.formError} isAnnounced />}
              <FormField
                control={form.control}
                name="label"
                render={({ field, fieldState }) => (
                  <Field label={t('label')} error={fieldState.error?.message}>
                    <Input autoComplete="off" autoFocus {...field} />
                  </Field>
                )}
              />
              <FormField
                control={form.control}
                name="pattern"
                render={({ field, fieldState }) => (
                  <Field
                    label={t('pattern')}
                    description={t('patternHelp')}
                    error={fieldState.error?.message}
                  >
                    <Input autoComplete="off" spellCheck={false} className="font-mono" {...field} />
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
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" type="button" onClick={onClose}>
                {t('cancel')}
              </Button>
              <Button type="submit" isLoading={c.isPending}>
                {c.isEditing ? t('save') : t('add')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
