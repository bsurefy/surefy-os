// SPDX-License-Identifier: AGPL-3.0-only
import { customApi, mcpServer } from './customEndpoint.js'
import { googleDrive } from './googleDrive.js'
import { notion } from './notion.js'
import { slack } from './slack.js'
import { whatsapp } from './whatsapp.js'

import type { ProviderAdapter } from './provider.types.js'

const ADAPTERS: readonly ProviderAdapter[] = [
  googleDrive,
  notion,
  slack,
  whatsapp,
  customApi,
  mcpServer,
]

/** The adapters by `provider_key`. Bridge providers join with the bridge catalog (V2). */
export function createProviderAdapters(): ReadonlyMap<string, ProviderAdapter> {
  return new Map(ADAPTERS.map((adapter) => [adapter.key, adapter]))
}

export * from './provider.types.js'
export { requestClientCredentialsToken, type ClientCredentialsApp } from './clientCredentials.js'
