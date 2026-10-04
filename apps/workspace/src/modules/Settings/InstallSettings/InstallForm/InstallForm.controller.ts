// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useTranslations } from 'next-intl'

import { useUpdateInstallSettingsMutation } from '@/api/install'
import {
  FEATURES,
  INSTALL_ORG_CREATION_POLICIES,
  INSTALL_SIGNUP_POLICIES,
  OAUTH_PROVIDERS,
} from '@surefy/contracts'
import type { InstallSettingsDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { useHasFeature } from '@surefy/web-core/access'
import { getErrorMessage } from '@surefy/web-core/errors'
import { useForm } from '@surefy/web-core/forms'

import { installFormSchema } from '../InstallSettings.schema'
import { toInstallFormValues, toInstallUpdate } from '../InstallSettings.utils'

import type { InstallFormValues } from '../InstallSettings.schema'
import type { BaseSyntheticEvent } from 'react'

/** Sign-in methods, sign-up, organization creation and web search, with the sticky save bar. */
export function useInstallFormController({ settings }: { settings: InstallSettingsDto }) {
  const t = useTranslations('settings.install.form')
  const tErrors = useTranslations('errors')
  const canSetCreationPolicy = useHasFeature(FEATURES.MULTI_ORGANIZATION)
  const mutation = useUpdateInstallSettingsMutation({ silent: true })
  const form = useForm({
    schema: installFormSchema,
    defaultValues: toInstallFormValues(settings),
  })

  const submit = form.handleSubmit(async (values: InstallFormValues) => {
    try {
      const updated = await mutation.mutateAsync(toInstallUpdate(values, canSetCreationPolicy))
      form.reset(toInstallFormValues(updated))
      toast.success(t('saved'))
    } catch (error) {
      form.setError('root', { message: getErrorMessage(error, tErrors) })
    }
  })

  return {
    form,
    onSubmit: (event: BaseSyntheticEvent) => {
      void submit(event)
    },
    isDirty: form.formState.isDirty,
    changeCount: Object.keys(form.formState.dirtyFields).length,
    isSaving: mutation.isPending,
    formError: form.formState.errors.root?.message,
    onDiscard: () => {
      form.reset(toInstallFormValues(settings))
    },
    canSetCreationPolicy,
    providers: OAUTH_PROVIDERS.map((provider) => ({
      provider,
      isConfigured: settings.signIn.oauth[provider].configured,
    })),
    signupOptions: INSTALL_SIGNUP_POLICIES.map((value) => ({
      value,
      label: t(`signupPolicy.options.${value}`),
    })),
    creationOptions: INSTALL_ORG_CREATION_POLICIES.map((value) => ({
      value,
      label: t(`orgCreationPolicy.options.${value}`),
    })),
    t,
  }
}
