// SPDX-License-Identifier: AGPL-3.0-only
import { basicAuth, formBody, requestTokens, tokenRequest } from './providerHttp.js'

import type { OauthTokens } from './provider.types.js'
import type { OutboundHttp } from '../connectionsHttp.js'

// OAuth 2 client credentials (server to server) for custom APIs and MCP servers: the person
// pastes the token URL, client ID and secret; no browser redirect happens. The token URL is an
// address a person typed in, so it goes through the checked client. The three values live in the
// connection's secret (`extra`), next to the access token they produced.

export interface ClientCredentialsApp {
  tokenUrl: string
  clientId: string
  clientSecret: string
  scopes: readonly string[]
}

export const requestClientCredentialsToken = (
  http: OutboundHttp,
  app: ClientCredentialsApp,
): Promise<OauthTokens> =>
  requestTokens(
    () =>
      http.external(
        app.tokenUrl,
        tokenRequest(
          { authorization: basicAuth(app.clientId, app.clientSecret) },
          formBody({
            grant_type: 'client_credentials',
            scope: app.scopes.length > 0 ? app.scopes.join(' ') : undefined,
          }),
        ),
      ),
    app.scopes,
  )
