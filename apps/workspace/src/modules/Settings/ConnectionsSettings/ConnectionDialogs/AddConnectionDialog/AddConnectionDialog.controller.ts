// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import {
  connectionQueries,
  useCreateConnectionMutation,
  useStartConnectionOauthMutation,
} from '@/api/connections'
import { teamQueries } from '@/api/teams'
import { ROUTES, SETTINGS_SECTION } from '@/constants/routes'
import { CONNECTIONS_ERROR_CODES, PAGE_SIZE } from '@surefy/contracts'
import type { ConnectionProviderDto, ConnectionScope } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { ADD_STEP, SIGN_IN_METHOD } from '../../ConnectionsSettings.constants'
import { goToExternalUrl } from '../../ConnectionsSettings.navigation'
import {
  buildCreateInput,
  buildStartOauthInput,
  getAllowedScopes,
  getExtraFields,
  getSignInMethods,
} from '../../ConnectionsSettings.utils'

import type { AddConnectionDialogProps } from './AddConnectionDialog.types'
import type { AddStep, SignInMethod } from '../../ConnectionsSettings.constants'
import type { SignInValues } from '../../ConnectionsSettings.schema'

/**
 * Add connection: choose the app, sign in, choose who can use it. Save runs the app's check
 * before anything is stored; an OAuth sign-in leaves for the app and returns to the callback page.
 */
export function useAddConnectionController({
  orgId,
  canManage,
  initialProviderKey,
  returnTo,
  onConnected,
  onClose,
}: Pick<
  AddConnectionDialogProps,
  'orgId' | 'canManage' | 'initialProviderKey' | 'returnTo' | 'onConnected' | 'onClose'
>) {
  const t = useTranslations('settings.connections.add')
  const tErrors = useTranslations('errors')
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const providers = useQuery(connectionQueries.providers(orgId))
  const teams = useInfiniteQuery(teamQueries.list(orgId, { sort: 'name', limit: PAGE_SIZE.max }))
  const create = useCreateConnectionMutation(orgId, { silent: true })
  const startOauth = useStartConnectionOauthMutation(orgId, { silent: true })

  const initialProvider = initialProviderKey
    ? providers.data?.find((item) => item.providerKey === initialProviderKey)
    : undefined
  const [chosen, setChosen] = useState<ConnectionProviderDto | null>(null)
  const [step, setStep] = useState<AddStep>(ADD_STEP.APP)
  const [method, setMethod] = useState<SignInMethod | null>(null)
  const [values, setValues] = useState<SignInValues | null>(null)
  const [scope, setScope] = useState<ConnectionScope>('personal')
  const [teamId, setTeamId] = useState<string | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [duplicate, setDuplicate] = useState(false)

  // opened from a place that needs a connection: the app is already chosen
  const provider = chosen ?? initialProvider ?? null
  const currentStep = provider && step === ADD_STEP.APP && initialProvider ? ADD_STEP.SIGN_IN : step
  const methods = provider ? getSignInMethods(provider) : []
  const currentMethod = method && methods.includes(method) ? method : (methods[0] ?? null)
  const allowedScopes = getAllowedScopes(canManage)
  const teamOptions = (teams.data?.pages.flatMap((page) => page.items) ?? []).map((team) => ({
    value: team.id,
    label: team.name,
  }))

  const connectionsPath = ROUTES.workspace.settings(orgSlug, SETTINGS_SECTION.CONNECTIONS)

  const fail = (caught: unknown) => {
    if (!isApiError(caught)) throw caught
    setDuplicate(caught.code === CONNECTIONS_ERROR_CODES.CONNECTION_DUPLICATE)
    setError(getErrorMessage(caught, tErrors))
  }

  const save = async () => {
    if (!provider || !currentMethod || !values) return
    setError(null)
    setDuplicate(false)
    const target = { scope, teamId: scope === 'team' ? teamId : undefined }
    try {
      if (currentMethod === SIGN_IN_METHOD.OAUTH) {
        const started = await startOauth.mutateAsync(
          buildStartOauthInput(provider, values, target, returnTo ?? connectionsPath),
        )
        goToExternalUrl(started.authorizationUrl)
        return
      }
      const connection = await create.mutateAsync(
        buildCreateInput(currentMethod, provider, values, target),
      )
      toast.success(
        connection.externalAccountLabel
          ? t('connectedAs', { account: connection.externalAccountLabel })
          : t('connected', { name: connection.name }),
      )
      onConnected?.(connection)
      onClose()
    } catch (caught) {
      fail(caught)
    }
  }

  return {
    step: currentStep,
    provider,
    providers: providers.data ?? [],
    isLoadingProviders: providers.isPending,
    providersError: providers.error ? getErrorMessage(providers.error, tErrors) : null,
    retryProviders: () => void providers.refetch(),
    methods,
    method: currentMethod,
    onMethodChange: setMethod,
    extraFields: provider ? getExtraFields(provider) : [],
    values,
    allowedScopes,
    scope,
    onScopeChange: setScope,
    teamId,
    onTeamChange: setTeamId,
    teamOptions,
    isTeamsLoading: teams.isPending,
    error,
    isDuplicate: duplicate,
    isSaving: create.isPending || startOauth.isPending,
    /** Team needs a team picked. */
    canSave: scope !== 'team' || teamId !== undefined,
    onChooseProvider: (item: ConnectionProviderDto) => {
      setChosen(item)
      setMethod(null)
      setStep(ADD_STEP.SIGN_IN)
    },
    onSignedIn: (next: SignInValues) => {
      setValues(next)
      setError(null)
      setStep(ADD_STEP.SCOPE)
    },
    onBack: () => {
      setError(null)
      setDuplicate(false)
      if (currentStep === ADD_STEP.SCOPE) setStep(ADD_STEP.SIGN_IN)
      else {
        setChosen(null)
        setStep(ADD_STEP.APP)
      }
    },
    canGoBackToApps: !initialProvider,
    onSave: save,
    t,
  }
}
