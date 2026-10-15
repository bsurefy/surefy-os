// SPDX-License-Identifier: AGPL-3.0-only
'use no memo'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

import { useReconnectConnectionMutation, useStartConnectionOauthMutation } from '@/api/connections'
import { ROUTES, SETTINGS_SECTION } from '@/constants/routes'
import type { ConnectionDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'
import { useForm } from '@surefy/web-core/forms'

import { SIGN_IN_METHOD } from '../ConnectionsSettings.constants'
import { goToExternalUrl } from '../ConnectionsSettings.navigation'
import { createSignInSchema } from '../ConnectionsSettings.schema'
import { buildReconnectInput, getReconnectMethod } from '../ConnectionsSettings.utils'

import type { SignInValues } from '../ConnectionsSettings.schema'

const EMPTY_VALUES: SignInValues = {
  name: '',
  baseUrl: '',
  secret: '',
  username: '',
  password: '',
  tokenUrl: '',
  clientId: '',
  clientSecret: '',
  oauthScopes: '',
  extra: {},
}

/**
 * Reconnect: an OAuth connection goes through the app's sign-in again and must be the same
 * account; keys, passwords and client credentials are replaced here, with the same check as adding.
 */
export function useReconnectController({
  orgId,
  connection,
  returnTo,
  onClose,
}: {
  orgId: string
  connection: ConnectionDto
  returnTo?: string
  onClose: () => void
}) {
  const t = useTranslations('settings.connections.reconnect')
  const tErrors = useTranslations('errors')
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const reconnect = useReconnectConnectionMutation(orgId, { silent: true })
  const startOauth = useStartConnectionOauthMutation(orgId, { silent: true })
  const [error, setError] = useState<string | null>(null)

  const method = getReconnectMethod(connection)
  const schema = useMemo(
    () =>
      createSignInSchema({ method, requiresBaseUrl: false, extraFields: [], isReconnect: true }),
    [method],
  )
  const form = useForm({ schema, defaultValues: EMPTY_VALUES })

  const fail = (caught: unknown) => {
    if (!isApiError(caught)) throw caught
    setError(getErrorMessage(caught, tErrors))
  }

  const signInAgain = async () => {
    setError(null)
    try {
      const started = await startOauth.mutateAsync({
        providerKey: connection.providerKey,
        name: connection.name,
        scope: connection.scope,
        ...(connection.team ? { teamId: connection.team.id } : {}),
        baseUrl: connection.baseUrl ?? undefined,
        reconnectConnectionId: connection.id,
        returnTo: returnTo ?? ROUTES.workspace.settings(orgSlug, SETTINGS_SECTION.CONNECTIONS),
      })
      goToExternalUrl(started.authorizationUrl)
    } catch (caught) {
      fail(caught)
    }
  }

  const submit = form.handleSubmit(async (values) => {
    setError(null)
    const input = buildReconnectInput(connection, values)
    if (!input) return
    try {
      await reconnect.mutateAsync({ id: connection.id, ...input })
      toast.success(t('reconnected', { name: connection.name }))
      onClose()
    } catch (caught) {
      fail(caught)
    }
  })

  return {
    t,
    form,
    method,
    isOauth: method === SIGN_IN_METHOD.OAUTH,
    error,
    isPending: form.formState.isSubmitting || startOauth.isPending,
    signInAgain: () => void signInAgain(),
    onSubmit: (event: React.BaseSyntheticEvent) => {
      void submit(event)
    },
  }
}
