// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { useWatch } from 'react-hook-form'

import { useCreateSearchProviderMutation, useTestConnectionMutation } from '@/api/vault'
import { ERROR_CODES, SEARCH_PROVIDER_CREDENTIAL, SEARCH_PROVIDER_KEYS } from '@surefy/contracts'
import type { ConnectionTestDto, CreateSearchProviderInput } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'
import { useForm } from '@surefy/web-core/forms'

import { addSearchProviderFormSchema } from './AddSearchProviderDialog.schema'
import { getProviderName } from '../../../Vault.utils'

import type { AddSearchProviderFormValues } from './AddSearchProviderDialog.schema'
import type { BaseSyntheticEvent } from 'react'

export interface AddSearchProviderDialogProps {
  orgId: string
  onClose: () => void
}

const EXPIRY_TIME = 'T23:59:59.000Z'

/** A test result counts only for the provider, key and address it was run with. */
const fingerprint = (
  values: Partial<Pick<AddSearchProviderFormValues, 'providerKey' | 'secret' | 'baseUrl'>>,
) => JSON.stringify([values.providerKey, values.secret, values.baseUrl])

/**
 * Add search provider: Save stays off until a connection test passed for the values now in the
 * form. The server runs the same test again when saving and answers with the reason if it fails.
 */
export function useAddSearchProviderController({ orgId, onClose }: AddSearchProviderDialogProps) {
  const t = useTranslations('vault.addSearchProvider')
  const tErrors = useTranslations('errors')
  const testConnection = useTestConnectionMutation(orgId)
  const create = useCreateSearchProviderMutation(orgId, { silent: true })
  const [tested, setTested] = useState<{ key: string; result: ConnectionTestDto } | null>(null)

  const form = useForm({
    schema: addSearchProviderFormSchema,
    defaultValues: {
      providerKey: 'brave',
      name: '',
      secret: '',
      baseUrl: '',
      expiresAt: '',
    } satisfies AddSearchProviderFormValues,
  })

  // `useWatch`, not `form.watch()`: the React Compiler would keep the first value of the latter
  const values = useWatch({ control: form.control })
  const current = tested?.key === fingerprint(values) ? tested.result : null
  const isTestCurrent = current?.ok === true
  const providerKey = values.providerKey ?? SEARCH_PROVIDER_KEYS[1]
  const needsAddress = SEARCH_PROVIDER_CREDENTIAL[providerKey] === 'base_url'

  /** Only the field the chosen provider needs is required, and only when testing. */
  const hasCredential = (input: AddSearchProviderFormValues): boolean => {
    const field =
      SEARCH_PROVIDER_CREDENTIAL[input.providerKey] === 'base_url' ? 'baseUrl' : 'secret'
    if (input[field].trim() !== '') return true
    form.setError(field, { message: t(field === 'baseUrl' ? 'addressRequired' : 'keyRequired') })
    return false
  }

  const runTest = async () => {
    const isValid = await form.trigger(['providerKey', 'secret', 'baseUrl'])
    const input = form.getValues()
    if (!isValid || !hasCredential(input)) return
    const result = await testConnection.mutateAsync({
      kind: 'search_provider',
      providerKey: input.providerKey,
      ...(needsAddress ? { baseUrl: input.baseUrl } : { secret: input.secret }),
    })
    setTested({ key: fingerprint(input), result })
  }

  const submit = form.handleSubmit(async (input) => {
    if (!isTestCurrent) return
    const body: CreateSearchProviderInput =
      input.providerKey === 'searxng'
        ? { providerKey: 'searxng', name: input.name, baseUrl: input.baseUrl }
        : {
            providerKey: input.providerKey,
            name: input.name,
            secret: input.secret,
            expiresAt: input.expiresAt ? `${input.expiresAt}${EXPIRY_TIME}` : undefined,
          }
    try {
      await create.mutateAsync(body)
      toast.success(t('added', { name: input.name }))
      onClose()
    } catch (error) {
      if (!isApiError(error)) throw error
      form.setError('root', { message: getErrorMessage(error, tErrors) })
      if (error.code === ERROR_CODES.VAULT_KEY_INVALID) setTested(null)
    }
  })

  return {
    t,
    form,
    providerOptions: SEARCH_PROVIDER_KEYS.map((key) => ({
      value: key,
      label: getProviderName(key),
    })),
    testResult: current,
    isTestCurrent,
    isTesting: testConnection.isPending,
    onTest: () => {
      void runTest()
    },
    needsAddress,
    formError: form.formState.errors.root?.message,
    isPending: form.formState.isSubmitting,
    canSave: isTestCurrent,
    onSubmit: (event: BaseSyntheticEvent) => {
      void submit(event)
    },
  }
}
