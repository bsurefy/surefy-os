// SPDX-License-Identifier: AGPL-3.0-only
import { customApi, mcpServer } from './customEndpoint.js'
import { createGoogleDriveAdapter } from './googleDrive.js'
import { createNotionAdapter } from './notion.js'
import { slack } from './slack.js'
import { whatsapp } from './whatsapp.js'

import type { ProviderAdapter } from './provider.types.js'
import type { ConnectionProviderOrigins } from '@/core/config/index.js'

/**
 * The adapters by `provider_key`. Bridge providers join with the bridge catalog (V2). `origins`
 * moves Google Drive and Notion to stub servers (`CONNECTIONS_PROVIDER_ORIGINS`).
 */
export function createProviderAdapters(
  origins: ConnectionProviderOrigins = {},
): ReadonlyMap<string, ProviderAdapter> {
  const adapters: readonly ProviderAdapter[] = [
    createGoogleDriveAdapter(origins['google-drive']),
    createNotionAdapter(origins.notion),
    slack,
    whatsapp,
    customApi,
    mcpServer,
  ]
  return new Map(adapters.map((adapter) => [adapter.key, adapter]))
}

export * from './provider.types.js'
export { requestClientCredentialsToken, type ClientCredentialsApp } from './clientCredentials.js'
