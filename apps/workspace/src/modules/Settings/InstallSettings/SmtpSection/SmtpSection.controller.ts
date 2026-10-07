// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { useSendTestEmailMutation, useUpdateInstallSettingsMutation } from '@/api/install'
import type { InstallSettingsDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { getErrorMessage } from '@surefy/web-core/errors'
import { useForm } from '@surefy/web-core/forms'

import { smtpFormSchema, testEmailSchema } from '../InstallSettings.schema'
import { toSmtpFormValues, toSmtpUpdate } from '../InstallSettings.utils'

import type { BaseSyntheticEvent } from 'react'

/** The mail server and "Send test email". Saving needs no save bar: it is one explicit action. */
export function useSmtpSectionController({ settings }: { settings: InstallSettingsDto }) {
  const t = useTranslations('settings.install.smtp')
  const tErrors = useTranslations('errors')
  const update = useUpdateInstallSettingsMutation({ silent: true })
  const sendTest = useSendTestEmailMutation({ silent: true })
  const [isTestSent, setIsTestSent] = useState(false)
  const form = useForm({ schema: smtpFormSchema, defaultValues: toSmtpFormValues(settings) })
  const testForm = useForm({ schema: testEmailSchema, defaultValues: { to: '' } })

  const submit = form.handleSubmit(async (values) => {
    try {
      const updated = await update.mutateAsync(toSmtpUpdate(values))
      form.reset(toSmtpFormValues(updated))
      toast.success(t('saved'))
    } catch (error) {
      form.setError('root', { message: getErrorMessage(error, tErrors) })
    }
  })

  const submitTest = testForm.handleSubmit(async (values) => {
    setIsTestSent(false)
    try {
      await sendTest.mutateAsync(values)
      setIsTestSent(true)
    } catch (error) {
      testForm.setError('root', { message: getErrorMessage(error, tErrors) })
    }
  })

  return {
    form,
    testForm,
    isConfigured: settings.smtp !== null,
    isPasswordSet: settings.smtp?.passwordSet ?? false,
    isSaving: update.isPending,
    formError: form.formState.errors.root?.message,
    onSubmit: (event: BaseSyntheticEvent) => {
      void submit(event)
    },
    onSwitchOff: () => {
      update.mutate(
        { smtp: null },
        {
          onSuccess: (updated) => {
            form.reset(toSmtpFormValues(updated))
            toast.success(t('switchedOff'))
          },
        },
      )
    },
    isTesting: testForm.formState.isSubmitting,
    isTestSent,
    testError: testForm.formState.errors.root?.message,
    onSubmitTest: (event: BaseSyntheticEvent) => {
      void submitTest(event)
    },
    t,
  }
}
