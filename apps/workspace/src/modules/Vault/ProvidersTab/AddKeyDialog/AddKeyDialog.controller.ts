// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { useWatch } from 'react-hook-form'

import {
  useCreateCredentialMutation,
  useCreatePersonalCredentialMutation,
  useTestConnectionMutation,
} from '@/api/vault'
import { AI_PROVIDER_KEYS, BASE_URL_PROVIDER_KEYS, ERROR_CODES } from '@surefy/contracts'
import type { ConnectionTestDto, CredentialDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'
import { useForm } from '@surefy/web-core/forms'

import { addKeyFormSchema } from './AddKeyDialog.schema'
import { KEY_SCOPE } from '../../Vault.constants'
import { useAccessSubjects } from '../../Vault.hooks'
import { getProviderName } from '../../Vault.utils'

import type { AddKeyFormValues } from './AddKeyDialog.schema'
import type { BaseSyntheticEvent } from 'react'

export interface AddKeyDialogProps {
  orgId: string
  /** `personal` is Profile › API keys: the scope is fixed to "Just me". */
  mode: 'organization' | 'personal'
  /** Rotation step 1: the key this one replaces; provider and scope stay as they are. */
  rotate?: CredentialDto
  onClose: () => void
}

const EXPIRY_TIME = 'T23:59:59.000Z'

/** A test result counts only for the provider, key and address it was run with. */
const fingerprint = (
  values: Partial<Pick<AddKeyFormValues, 'providerKey' | 'secret' | 'baseUrl'>>,
) => JSON.stringify([values.providerKey, values.secret, values.baseUrl])

/**
 * Add API key: Save stays off until a connection test passed for the values now in the form. The
 * server runs the same test again when saving and answers with the provider's reason if it fails.
 */
export function useAddKeyController({ orgId, mode, rotate, onClose }: AddKeyDialogProps) {
  const t = useTranslations('vault.addKey')
  const tErrors = useTranslations('errors')
  const subjects = useAccessSubjects()
  const testConnection = useTestConnectionMutation(orgId)
  const createOrg = useCreateCredentialMutation(orgId, { silent: true })
  const createPersonal = useCreatePersonalCredentialMutation(orgId, { silent: true })
  const [tested, setTested] = useState<{ key: string; result: ConnectionTestDto } | null>(null)

  const form = useForm({
    schema: addKeyFormSchema,
    defaultValues: {
      providerKey: rotate?.providerKey ?? AI_PROVIDER_KEYS[0],
      name: rotate ? t('rotatedName', { name: rotate.name }) : '',
      secret: '',
      baseUrl: rotate?.baseUrl ?? '',
      scope: rotate?.scope === 'team' ? KEY_SCOPE.TEAM : KEY_SCOPE.ORGANIZATION,
      teamId: rotate?.team?.id ?? '',
      expiresAt: '',
    } satisfies AddKeyFormValues,
  })

  // `useWatch`, not `form.watch()`: the React Compiler would keep the first value of the latter
  const values = useWatch({ control: form.control })
  const current = tested?.key === fingerprint(values) ? tested.result : null
  const isTestCurrent = current?.ok === true
  const needsTeam = mode === 'organization' && values.scope === KEY_SCOPE.TEAM && !values.teamId
  // a personal key reaches its provider at the provider's own address, so providers that need
  // an address of their own are not offered for one
  const providerKeys =
    mode === 'personal'
      ? AI_PROVIDER_KEYS.filter(
          (key) => !(BASE_URL_PROVIDER_KEYS as readonly string[]).includes(key),
        )
      : AI_PROVIDER_KEYS

  const runTest = async () => {
    const isValid = await form.trigger(['providerKey', 'secret', 'baseUrl'])
    if (!isValid) return
    const input = form.getValues()
    const result = await testConnection.mutateAsync({
      kind: 'ai_provider',
      providerKey: input.providerKey,
      secret: input.secret,
      baseUrl: input.baseUrl || undefined,
    })
    setTested({ key: fingerprint(input), result })
  }

  const submit = form.handleSubmit(async (input) => {
    if (!isTestCurrent) return
    const base = {
      name: input.name,
      providerKey: input.providerKey,
      secret: input.secret,
      baseUrl: input.baseUrl || undefined,
      expiresAt: input.expiresAt ? `${input.expiresAt}${EXPIRY_TIME}` : undefined,
      rotatesCredentialId: rotate?.id,
    }
    try {
      if (mode === 'personal') await createPersonal.mutateAsync(base)
      else if (input.scope === KEY_SCOPE.TEAM) {
        await createOrg.mutateAsync({ ...base, scope: 'team', teamId: input.teamId })
      } else await createOrg.mutateAsync({ ...base, scope: 'organization' })
      toast.success(rotate ? t('rotated', { name: input.name }) : t('added', { name: input.name }))
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
    teams: subjects.teams.map((team) => ({ value: team.id, label: team.name })),
    providerOptions: providerKeys.map((key) => ({ value: key, label: getProviderName(key) })),
    testResult: current,
    isTestCurrent,
    isTesting: testConnection.isPending,
    onTest: () => {
      void runTest()
    },
    needsTeam,
    isRotation: Boolean(rotate),
    formError: form.formState.errors.root?.message,
    isPending: form.formState.isSubmitting,
    canSave: isTestCurrent && !needsTeam,
    onSubmit: (event: BaseSyntheticEvent) => {
      void submit(event)
    },
  }
}
