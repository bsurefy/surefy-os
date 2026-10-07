// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { useWatch } from 'react-hook-form'

import { useCreateLocalServerMutation, useTestConnectionMutation } from '@/api/vault'
import { LOCAL_SERVER_PROVIDER_KEYS } from '@surefy/contracts'
import type { ConnectionTestDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'
import { useForm } from '@surefy/web-core/forms'

import { addServerFormSchema } from './AddServerDialog.schema'
import { KEY_SCOPE } from '../../Vault.constants'
import { useAccessSubjects } from '../../Vault.hooks'
import { getProviderName } from '../../Vault.utils'

import type { AddServerFormValues } from './AddServerDialog.schema'
import type { BaseSyntheticEvent } from 'react'

const fingerprint = (
  values: Partial<Pick<AddServerFormValues, 'providerKey' | 'baseUrl' | 'secret'>>,
) => JSON.stringify([values.providerKey, values.baseUrl, values.secret])

/**
 * Add local server: Save stays off until a connection test passed for the address now in the form;
 * the models it found are stored disabled, ready to enable.
 */
export function useAddServerController({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const t = useTranslations('vault.addServer')
  const tErrors = useTranslations('errors')
  const subjects = useAccessSubjects()
  const testConnection = useTestConnectionMutation(orgId)
  const create = useCreateLocalServerMutation(orgId, { silent: true })
  const [tested, setTested] = useState<{ key: string; result: ConnectionTestDto } | null>(null)

  const form = useForm({
    schema: addServerFormSchema,
    defaultValues: {
      providerKey: LOCAL_SERVER_PROVIDER_KEYS[0],
      name: '',
      baseUrl: '',
      secret: '',
      scope: KEY_SCOPE.ORGANIZATION,
      teamId: '',
    } satisfies AddServerFormValues,
  })

  // `useWatch`, not `form.watch()`: the React Compiler would keep the first value of the latter
  const values = useWatch({ control: form.control })
  const current = tested?.key === fingerprint(values) ? tested.result : null
  const isTestCurrent = current?.ok === true
  const needsTeam = values.scope === KEY_SCOPE.TEAM && !values.teamId

  const runTest = async () => {
    const isValid = await form.trigger(['providerKey', 'baseUrl', 'secret'])
    if (!isValid) return
    const input = form.getValues()
    const result = await testConnection.mutateAsync({
      kind: 'local_server',
      providerKey: input.providerKey,
      baseUrl: input.baseUrl,
      secret: input.secret || undefined,
    })
    setTested({ key: fingerprint(input), result })
  }

  const submit = form.handleSubmit(async (input) => {
    if (!isTestCurrent) return
    const base = {
      name: input.name,
      providerKey: input.providerKey,
      baseUrl: input.baseUrl,
      secret: input.secret || undefined,
    }
    try {
      if (input.scope === KEY_SCOPE.TEAM) {
        await create.mutateAsync({ ...base, scope: 'team', teamId: input.teamId })
      } else await create.mutateAsync({ ...base, scope: 'organization' })
      toast.success(t('added', { name: input.name, count: current.models.length }))
      onClose()
    } catch (error) {
      if (!isApiError(error)) throw error
      form.setError('root', { message: getErrorMessage(error, tErrors) })
    }
  })

  return {
    t,
    form,
    teams: subjects.teams.map((team) => ({ value: team.id, label: team.name })),
    providerOptions: LOCAL_SERVER_PROVIDER_KEYS.map((key) => ({
      value: key,
      label: getProviderName(key),
    })),
    testResult: current,
    isTesting: testConnection.isPending,
    onTest: () => {
      void runTest()
    },
    formError: form.formState.errors.root?.message,
    isPending: form.formState.isSubmitting,
    canSave: isTestCurrent && !needsTeam,
    onSubmit: (event: BaseSyntheticEvent) => {
      void submit(event)
    },
  }
}
