// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import type { GuardSettingsDto } from '@surefy/contracts'
import { Banner } from '@surefy/ui/components/Feedback'
import { SaveBar } from '@surefy/ui/components/Forms'
import { Form } from '@surefy/ui/primitives/form'

import GuardReasonDialog from '../../GuardReasonDialog'
import ApprovalSettingsSection from '../ApprovalSettingsSection'
import { FORM_ID } from '../GuardDefaults.constants'
import ThresholdsSection from '../ThresholdsSection'
import { useDefaultsFormController } from './DefaultsForm.controller'

interface DefaultsFormProps {
  settings: GuardSettingsDto
  /** Admins and Owners change the defaults; Builders see the values. */
  canManage: boolean
}

export default function DefaultsForm({ settings, canManage }: Readonly<DefaultsFormProps>) {
  const c = useDefaultsFormController({ settings })
  const { t, form, values } = c

  return (
    <>
      {!canManage && (
        <Banner tone="info" title={t('readOnly.title')} description={t('readOnly.description')} />
      )}
      <Form {...form}>
        <form id={FORM_ID} noValidate onSubmit={c.onSubmit} className="flex flex-col gap-6">
          <ThresholdsSection
            control={form.control}
            autoPercent={values.autoPercent ?? 0}
            reviewPercent={values.reviewPercent ?? 0}
            isReadOnly={!canManage}
          />
          <ApprovalSettingsSection
            control={form.control}
            currency={settings.currency}
            isStepUpEnabled={values.stepUpEnabled ?? false}
            isReadOnly={!canManage}
          />
        </form>
      </Form>
      {canManage && (
        <>
          <SaveBar
            formId={FORM_ID}
            isDirty={c.isDirty}
            isSaving={c.isSaving}
            onDiscard={c.onDiscard}
            labels={{
              message: c.saveError ? t('save.failed') : t('save.unsaved', { count: c.changeCount }),
              discard: t('save.discard'),
              save: c.saveError ? t('save.retry') : t('save.save'),
            }}
          />
          <GuardReasonDialog
            open={c.confirm.open}
            onOpenChange={c.confirm.onOpenChange}
            title={t('save.confirm.title')}
            description={t('save.confirm.description')}
            impact={c.confirm.impact}
            isReasonRequired={c.confirm.isReasonRequired}
            labels={{
              confirm: t('save.confirm.confirm'),
              reason: t('save.confirm.reason'),
              reasonHelp: t('save.confirm.reasonHelp'),
              reasonRequired: t('save.confirm.reasonRequired'),
            }}
            error={c.confirm.error}
            onConfirm={c.confirm.onConfirm}
          />
        </>
      )}
    </>
  )
}
