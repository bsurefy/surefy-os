// SPDX-License-Identifier: AGPL-3.0-only
import { CONNECTIONS_ERROR_CODES } from '@surefy/contracts'

import {
  asString,
  bearer,
  checkCall,
  checkRequest,
  formBody,
  jsonObject,
  requestTokens,
  tokenRequest,
} from './providerHttp.js'

import type { OutboundHttp } from '../connectionsHttp.js'
import type { OauthTokens, ProviderAdapter } from './provider.types.js'

// Slack (channel): the v2 authorization code flow for a bot token (no PKCE). Slack answers 200
// with `ok: false` and an `error` code for most failures, which the token reader treats as a
// refusal. Token rotation is optional in a Slack app; when it is on, a refresh token comes back
// and the access token expires.

const AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize'
const TOKEN_URL = 'https://slack.com/api/oauth.v2.access'
const AUTH_TEST_URL = 'https://slack.com/api/auth.test'
const REVOKE_URL = 'https://slack.com/api/auth.revoke'
const DEFAULT_SCOPES = [
  'app_mentions:read',
  'chat:write',
  'im:history',
  'im:read',
  'im:write',
] as const

const tokenCall = (http: OutboundHttp, values: Record<string, string>): Promise<OauthTokens> =>
  requestTokens(() => http.provider(TOKEN_URL, tokenRequest({}, formBody(values))), DEFAULT_SCOPES)

export const slack: ProviderAdapter = {
  key: 'slack',
  authorizationCode: {
    pkce: false,
    defaultScopes: DEFAULT_SCOPES,
    authorizationUrl: ({ app, redirectUri, state, scopes }) =>
      `${AUTHORIZE_URL}?${formBody({
        client_id: app.clientId,
        redirect_uri: redirectUri,
        scope: scopes.join(','),
        state,
      })}`,
    exchangeCode: (http, { app, redirectUri, code }) =>
      tokenCall(http, {
        code,
        redirect_uri: redirectUri,
        client_id: app.clientId,
        client_secret: app.clientSecret,
      }),
    refresh: (http, { app, refreshToken }) =>
      tokenCall(http, {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: app.clientId,
        client_secret: app.clientSecret,
      }),
    revoke: async (http, { secret }) => {
      if (secret.accessToken === undefined) return
      await http.provider(
        REVOKE_URL,
        tokenRequest({ authorization: bearer(secret.accessToken) }, ''),
      )
    },
  },
  check: (http, { secret }) =>
    checkCall(
      () =>
        http.provider(AUTH_TEST_URL, {
          ...checkRequest({ authorization: bearer(secret.accessToken ?? '') }),
          method: 'POST',
        }),
      (result) => {
        const body = jsonObject(result)
        if (body.ok !== true) {
          return {
            ok: false,
            reasonCode:
              asString(body.error) === 'token_expired' || asString(body.error) === 'invalid_auth'
                ? CONNECTIONS_ERROR_CODES.CONNECTION_TOKEN_EXPIRED
                : CONNECTIONS_ERROR_CODES.CONNECTION_PROVIDER_REJECTED,
            latencyMs: result.latencyMs,
          }
        }
        // the workspace and the app's bot user in it: an agent's Slack channel is routed by both
        const team = asString(body.team_id)
        const bot = asString(body.user_id)
        return {
          ok: true,
          latencyMs: result.latencyMs,
          account: {
            id: team === null || bot === null ? team : `${team}/${bot}`,
            label: asString(body.team),
          },
        }
      },
    ),
}
