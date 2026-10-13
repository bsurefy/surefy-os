// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useTranslations } from 'next-intl'

import { useRenameApiKeyMutation } from '@/api/apiKeys'
import type { ApiKeyDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'
import { useForm } from '@surefy/web-core/forms'

import { renameApiKeySchema } from '../ApiKeysSettings.schema'

import type { RenameApiKeyValues } from '../ApiKeysSettings.schema'
import type { BaseSyntheticEvent } from 'react'

/** Renaming is the one change a key allows; it applies at once (T0). */
export function useRenameApiKeyController({
  orgId,
  apiKey,
  onClose,
}: {
  orgId: string
  apiKey: ApiKeyDto
  onClose: () => void
}) {
  const t = useTranslations('settings.apiKeys.rename')
  const tErrors = useTranslations('errors')
  const rename = useRenameApiKeyMutation(orgId, { silent: true })
  const form = useForm({
    schema: renameApiKeySchema,
    defaultValues: { name: apiKey.name } satisfies RenameApiKeyValues,
  })

  const submit = form.handleSubmit(async (values) => {
    try {
      await rename.mutateAsync({ keyId: apiKey.id, name: values.name })
      toast.success(t('renamed', { name: values.name }))
      onClose()
    } catch (error) {
      if (!isApiError(error)) throw error
      form.setError('root', { message: getErrorMessage(error, tErrors) })
    }
  })

  return {
    form,
    formError: form.formState.errors.root?.message,
    isPending: form.formState.isSubmitting,
    onSubmit: (event: BaseSyntheticEvent) => {
      void submit(event)
    },
  }
}
