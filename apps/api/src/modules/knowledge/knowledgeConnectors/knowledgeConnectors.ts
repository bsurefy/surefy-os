// SPDX-License-Identifier: AGPL-3.0-only
import type { KnowledgeConnectorProvider } from '@surefy/contracts'

import { createConnectorTransport, type ConnectorTransportDeps } from './connectorTransport.js'
import { createGoogleDriveConnector } from './googleDriveConnector.js'
import { createNotionConnector } from './notionConnector.js'

import type { KnowledgeConnectorClient } from './knowledgeConnectors.types.js'

export type KnowledgeConnectorClients = Readonly<
  Record<KnowledgeConnectorProvider, KnowledgeConnectorClient>
>

/** Other API addresses for the providers (stub servers in end-to-end tests). */
export interface KnowledgeConnectorEndpoints {
  googleDrive?: string
  notion?: string
}

/** One client per connector; overridden addresses are called as local hosts (`external`). */
export function createKnowledgeConnectors(
  deps: Omit<ConnectorTransportDeps, 'external'> & { endpoints?: KnowledgeConnectorEndpoints },
): KnowledgeConnectorClients {
  const endpoints = deps.endpoints ?? {}
  const transport = (overridden: boolean) =>
    createConnectorTransport({ http: deps.http, get: deps.get, external: overridden })
  return {
    google_drive: createGoogleDriveConnector(
      transport(endpoints.googleDrive !== undefined),
      endpoints.googleDrive,
    ),
    notion: createNotionConnector(transport(endpoints.notion !== undefined), endpoints.notion),
  }
}
