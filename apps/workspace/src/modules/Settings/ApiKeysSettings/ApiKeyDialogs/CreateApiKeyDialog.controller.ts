// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { useCreateApiKeyMutation } from '@/api/apiKeys'
import { ERROR_CODES } from '@surefy/contracts'
import type { ApiKeyCreatedDto } from '@surefy/contracts'
import { hasPermission, useEffectiveAccess } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'
import { useForm } from '@surefy/web-core/forms'

import { API_KEY_DEFAULT_EXPIRY } from '../ApiKeysSettings.constants'
import { createApiKeySchema } from '../ApiKeysSettings.schema'
import { getAvailableScopes, getEarliestExpiryDate, getExpiresAt } from '../ApiKeysSettings.utils'

import type { CreateApiKeyValues } from '../ApiKeysSettings.schema'
import type { BaseSyntheticEvent } from 'react'

/**
 * Creating needs a fresh session. When it is not, the app-wide "Confirm it's you" dialog opens
 * over this one, nothing is created and the form keeps its input: the person presses Create again.
 */
export function useCreateApiKeyController({
  orgId,
  initialScopes = [],
}: {
  orgId: string
  /** Permissions ticked when the dialog opens (the Publish tab's API channel sends Run agents). */
  initialScopes?: readonly string[]
}) {
  const t = useTranslations('settings.apiKeys.create')
  const tScopes = useTranslations('settings.apiKeys.scopes')
  const tErrors = useTranslations('errors')
  const { data: access } = useEffectiveAccess()
  const create = useCreateApiKeyMutation(orgId, { silent: true })
  const [created, setCreated] = useState<ApiKeyCreatedDto | null>(null)

  // the person may have lost a permission since the screen loaded: it leaves the list
  const availableScopes = getAvailableScopes((permission) =>
    access ? hasPermission(access, permission) : false,
  )
  const form = useForm({
    schema: createApiKeySchema,
    defaultValues: {
      name: '',
      scopes: availableScopes.filter((scope) => initialScopes.includes(scope)),
      expiry: API_KEY_DEFAULT_EXPIRY,
      date: '',
    } satisfies CreateApiKeyValues,
  })

  const submit = form.handleSubmit(async (values) => {
    try {
      const expiresAt = getExpiresAt(values.expiry, values.date, new Date())
      setCreated(
        await create.mutateAsync({
          name: values.name,
          scopes: values.scopes.filter((scope) => availableScopes.some((item) => item === scope)),
          expiresAt,
        }),
      )
    } catch (error) {
      if (!isApiError(error)) throw error
      // the confirmation dialog is the one message for this failure
      if (error.code === ERROR_CODES.AUTH_SESSION_NOT_FRESH) return
      const message = getErrorMessage(error, tErrors)
      let field: 'expiry' | 'scopes' | 'root' = 'root'
      if (error.code === ERROR_CODES.API_KEY_EXPIRY_INVALID) field = 'expiry'
      if (
        error.code === ERROR_CODES.API_KEY_SCOPE_NOT_ALLOWED ||
        error.code === ERROR_CODES.ACCESS_EXCEEDS_PARENT
      ) {
        field = 'scopes'
      }
      form.setError(field, { message })
    }
  })

  return {
    form,
    availableScopes,
    created,
    earliestDate: getEarliestExpiryDate(new Date()),
    expiry: form.watch('expiry'),
    formError: form.formState.errors.root?.message,
    isPending: form.formState.isSubmitting,
    onSubmit: (event: BaseSyntheticEvent) => {
      void submit(event)
    },
    t,
    tScopes,
  }
}
