// SPDX-License-Identifier: AGPL-3.0-only
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import { useCompleteConnectionOauthMutation } from '@/api/connections'
import { ROUTES, SETTINGS_SECTION } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import { CONNECTIONS_ERROR_CODES } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { OAUTH_RETURN_PARAMS } from '../ConnectionsSettings.constants'
import { safeReturnPath } from '../ConnectionsSettings.utils'

/** How the sign-in ended when it did not complete the connection. */
export type ConnectingFailure =
  | { kind: 'declined'; message: string | null }
  | { kind: 'expired' }
  | { kind: 'failed'; message: string }

interface ReturnParams {
  state: string | null
  code: string | null
  error: string | null
  errorDescription: string | null
}

/** The app reported an error, or the browser came back without `state` and `code`. */
function getImmediateFailure({
  state,
  code,
  error,
  errorDescription,
}: ReturnParams): ConnectingFailure | null {
  if (!state) return { kind: 'expired' }
  // an app that sends only a code (Slack's `access_denied`) gets the page's own words, not the code
  if (error !== null) return { kind: 'declined', message: errorDescription }
  if (code === null) return { kind: 'expired' }
  return null
}

/**
 * The page the app sends the browser back to after a sign-in: completes the connection with the
 * `code` (or reports the app's error), then returns to where the person started.
 */
export function useConnectingPageController() {
  const t = useTranslations('settings.connections.callback')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const router = useRouter()
  const params = useSearchParams()
  const complete = useCompleteConnectionOauthMutation(orgId, { silent: true })
  const [asyncFailure, setFailure] = useState<ConnectingFailure | null>(null)
  const started = useRef(false)

  const state = params.get(OAUTH_RETURN_PARAMS.STATE)
  const code = params.get(OAUTH_RETURN_PARAMS.CODE)
  const error = params.get(OAUTH_RETURN_PARAMS.ERROR)
  const errorDescription = params.get(OAUTH_RETURN_PARAMS.ERROR_DESCRIPTION)
  const connectionsPath = ROUTES.workspace.settings(orgSlug, SETTINGS_SECTION.CONNECTIONS)

  // a return without a usable answer needs no request
  const immediateFailure = getImmediateFailure({ state, code, error, errorDescription })
  const failure = immediateFailure ?? asyncFailure

  const { mutateAsync } = complete
  useEffect(() => {
    // the page may render twice in development; the sign-in code is single use
    if (started.current || immediateFailure || !state) return
    started.current = true
    void (async () => {
      try {
        const result = await mutateAsync({ state, code: code ?? undefined })
        const account = result.connection.externalAccountLabel ?? result.connection.name
        toast.success(
          result.outcome === 'reconnected'
            ? t('reconnected', { account })
            : t('connected', { account }),
        )
        router.replace(toRoute(safeReturnPath(result.returnTo, connectionsPath)))
      } catch (caught) {
        if (!isApiError(caught)) throw caught
        if (caught.code === CONNECTIONS_ERROR_CODES.CONNECTION_OAUTH_STATE_INVALID) {
          setFailure({ kind: 'expired' })
        } else if (caught.code === CONNECTIONS_ERROR_CODES.CONNECTION_OAUTH_DENIED) {
          setFailure({ kind: 'declined', message: null })
        } else {
          setFailure({ kind: 'failed', message: getErrorMessage(caught, tErrors) })
        }
      }
    })()
  }, [immediateFailure, state, code, mutateAsync, router, connectionsPath, t, tErrors])

  return {
    t,
    failure,
    /** Back to the list; the person starts the sign-in again from Add connection. */
    onStartAgain: () => {
      router.replace(toRoute(connectionsPath))
    },
  }
}
