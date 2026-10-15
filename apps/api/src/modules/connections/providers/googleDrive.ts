// SPDX-License-Identifier: AGPL-3.0-only
import { CONNECTIONS_ERROR_CODES } from '@surefy/contracts'

import {
  asString,
  bearer,
  checkCall,
  checkRequest,
  formBody,
  jsonObject,
  providerEndpoints,
  requestTokens,
  tokenRequest,
} from './providerHttp.js'

import type { ProviderAdapter } from './provider.types.js'

// Google Drive (knowledge connector): authorization code with PKCE, offline access so a refresh
// token comes back. The account is named by the Drive "about" call, which the read-only Drive
// scope allows. Its addresses move to a stub server's origin in end-to-end runs.

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const ABOUT_URL = 'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,permissionId)'
const DEFAULT_SCOPES = ['https://www.googleapis.com/auth/drive.readonly'] as const

export function createGoogleDriveAdapter(origin?: string): ProviderAdapter {
  const { url, call } = providerEndpoints(origin)
  return {
    key: 'google-drive',
    authorizationCode: {
      pkce: true,
      defaultScopes: DEFAULT_SCOPES,
      authorizationUrl: ({ app, redirectUri, state, codeChallenge, scopes }) =>
        `${url(AUTHORIZE_URL)}?${formBody({
          client_id: app.clientId,
          redirect_uri: redirectUri,
          response_type: 'code',
          scope: scopes.join(' '),
          state,
          code_challenge: codeChallenge,
          code_challenge_method: 'S256',
          access_type: 'offline',
          prompt: 'consent',
        })}`,
      exchangeCode: (http, { app, redirectUri, code, codeVerifier }) =>
        requestTokens(
          () =>
            call(
              http,
              url(TOKEN_URL),
              tokenRequest(
                {},
                formBody({
                  grant_type: 'authorization_code',
                  code,
                  redirect_uri: redirectUri,
                  client_id: app.clientId,
                  client_secret: app.clientSecret,
                  code_verifier: codeVerifier,
                }),
              ),
            ),
          DEFAULT_SCOPES,
        ),
      refresh: async (http, { app, refreshToken }) => {
        const tokens = await requestTokens(
          () =>
            call(
              http,
              url(TOKEN_URL),
              tokenRequest(
                {},
                formBody({
                  grant_type: 'refresh_token',
                  refresh_token: refreshToken,
                  client_id: app.clientId,
                  client_secret: app.clientSecret,
                }),
              ),
            ),
          DEFAULT_SCOPES,
        )
        // Google does not repeat the refresh token when it refreshes
        return { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken }
      },
      revoke: async (http, { secret }) => {
        const token = secret.refreshToken ?? secret.accessToken
        if (token === undefined) return
        await call(http, url(REVOKE_URL), tokenRequest({}, formBody({ token })))
      },
    },
    check: (http, { secret }) =>
      checkCall(
        () =>
          call(
            http,
            url(ABOUT_URL),
            checkRequest({ authorization: bearer(secret.accessToken ?? '') }),
          ),
        (result) => {
          const user = jsonObject({ text: JSON.stringify(jsonObject(result).user ?? {}) })
          const email = asString(user.emailAddress)
          if (result.status >= 400) {
            return {
              ok: false,
              reasonCode: CONNECTIONS_ERROR_CODES.CONNECTION_PROVIDER_REJECTED,
              latencyMs: result.latencyMs,
            }
          }
          return {
            ok: true,
            latencyMs: result.latencyMs,
            account: { id: asString(user.permissionId) ?? email, label: email },
          }
        },
      ),
  }
}
