// SPDX-License-Identifier: AGPL-3.0-only
import { CONNECTIONS_ERROR_CODES } from '@surefy/contracts'

import { authHeaders, checkCall, checkRequest } from './providerHttp.js'

import type { ProviderAdapter } from './provider.types.js'

// Custom APIs (`http`) and MCP servers (`mcp`): an address a person typed in. The check calls
// the base address with the stored credentials; reaching it without the app refusing them is a
// pass. The deeper handshake (listing an MCP server's tools, an API's actions) belongs to the
// tool adapters.

/** The address names the account: nothing identifies it more precisely. */
const accountOf = (baseUrl: string) => {
  const host = (() => {
    try {
      return new URL(baseUrl).host
    } catch {
      return baseUrl
    }
  })()
  return { id: null, label: host }
}

const endpoint =
  (key: 'http' | 'mcp'): ProviderAdapter['check'] =>
  (http, { secret, baseUrl }) => {
    if (baseUrl === null) {
      return Promise.resolve({
        ok: false,
        reasonCode: CONNECTIONS_ERROR_CODES.CONNECTION_UNREACHABLE,
        latencyMs: null,
        unsafeAddress: true,
      })
    }
    return checkCall(
      () => http.external(baseUrl, checkRequest(authHeaders(secret))),
      (result) =>
        // an MCP server that answers 404 has no endpoint at this address
        key === 'mcp' && result.status === 404
          ? {
              ok: false,
              reasonCode: CONNECTIONS_ERROR_CODES.CONNECTION_PROVIDER_REJECTED,
              latencyMs: result.latencyMs,
            }
          : { ok: true, latencyMs: result.latencyMs, account: accountOf(baseUrl) },
    )
  }

export const customApi: ProviderAdapter = { key: 'http', check: endpoint('http') }
export const mcpServer: ProviderAdapter = { key: 'mcp', check: endpoint('mcp') }
