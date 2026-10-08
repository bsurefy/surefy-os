// SPDX-License-Identifier: AGPL-3.0-only
import { CONNECTIONS_ERROR_CODES } from '@surefy/contracts'

import {
  asString,
  basicAuth,
  bearer,
  checkCall,
  checkRequest,
  formBody,
  jsonObject,
  requestTokens,
} from './providerHttp.js'
import { TOKEN_TIMEOUT_MS } from '../connections.constants.js'

import type { ProviderAdapter } from './provider.types.js'

// Notion (knowledge connector): authorization code (no PKCE), client credentials as Basic auth,
// JSON bodies. Tokens do not expire, so there is no refresh. A pasted internal-integration token
// is checked the same way.

const AUTHORIZE_URL = 'https://api.notion.com/v1/oauth/authorize'
const TOKEN_URL = 'https://api.notion.com/v1/oauth/token'
const REVOKE_URL = 'https://api.notion.com/v1/oauth/revoke'
const ME_URL = 'https://api.notion.com/v1/users/me'
const API_VERSION = '2022-06-28'

export const notion: ProviderAdapter = {
  key: 'notion',
  authorizationCode: {
    pkce: false,
    defaultScopes: [],
    authorizationUrl: ({ app, redirectUri, state }) =>
      `${AUTHORIZE_URL}?${formBody({
        client_id: app.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        owner: 'user',
        state,
      })}`,
    exchangeCode: (http, { app, redirectUri, code }) =>
      requestTokens(
        () =>
          http.provider(TOKEN_URL, {
            method: 'POST',
            headers: {
              authorization: basicAuth(app.clientId, app.clientSecret),
              'content-type': 'application/json',
              'notion-version': API_VERSION,
            },
            body: JSON.stringify({
              grant_type: 'authorization_code',
              code,
              redirect_uri: redirectUri,
            }),
            timeoutMs: TOKEN_TIMEOUT_MS,
          }),
        [],
      ),
    revoke: async (http, { app, secret }) => {
      if (secret.accessToken === undefined) return
      await http.provider(REVOKE_URL, {
        method: 'POST',
        headers: {
          authorization: basicAuth(app.clientId, app.clientSecret),
          'content-type': 'application/json',
          'notion-version': API_VERSION,
        },
        body: JSON.stringify({ token: secret.accessToken }),
        timeoutMs: TOKEN_TIMEOUT_MS,
      })
    },
  },
  check: (http, { secret }) =>
    checkCall(
      () =>
        http.provider(
          ME_URL,
          checkRequest({
            authorization: bearer(secret.accessToken ?? secret.token ?? ''),
            'notion-version': API_VERSION,
          }),
        ),
      (result) => {
        if (result.status >= 400) {
          return {
            ok: false,
            reasonCode: CONNECTIONS_ERROR_CODES.CONNECTION_PROVIDER_REJECTED,
            latencyMs: result.latencyMs,
          }
        }
        const body = jsonObject(result)
        const bot = jsonObject({ text: JSON.stringify(body.bot ?? {}) })
        const workspaceName = asString(bot.workspace_name)
        return {
          ok: true,
          latencyMs: result.latencyMs,
          account: {
            id: asString(bot.workspace_id) ?? asString(body.id),
            label: workspaceName ?? asString(body.name),
          },
        }
      },
    ),
}
