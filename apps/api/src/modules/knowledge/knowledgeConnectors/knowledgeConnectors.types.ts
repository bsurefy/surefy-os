// SPDX-License-Identifier: AGPL-3.0-only
import type {
  KnowledgeConnectorConfig,
  KnowledgeConnectorItemDto,
  KnowledgeConnectorProvider,
} from '@surefy/contracts'

// The knowledge connectors (database/knowledge.md, "Connector and link sync"): what a connector
// lists and fetches through its connection's access token. Vendor response shapes stay in the
// file of the client that reads them.

/** Files listed per connector source; the rest wait until folders are narrowed. */
export const KNOWLEDGE_CONNECTOR_FILES_MAX = 5000

/** One level of the folder picker, as the provider pages it. */
export interface ConnectorItemsPage {
  items: Omit<KnowledgeConnectorItemDto, 'inBase'>[]
  nextCursor: string | null
}

export interface ConnectorItemsQuery {
  parentId: string | undefined
  q: string | undefined
  limit: number
  cursor: string | undefined
}

/** A remote file or page under the chosen folders: one document of the source. */
export interface ConnectorFile {
  /** Drive file id or Notion page id; the document's `external_ref`. */
  externalId: string
  title: string
  /** The remote revision (Drive checksum or version, Notion edit time); the document's `content_hash`. */
  revision: string
  /** How `fetch` reaches the content; opaque outside the client. */
  ref: string
}

export interface ConnectorContent {
  bytes: Buffer
  mimeType: string
}

export interface KnowledgeConnectorClient {
  provider: KnowledgeConnectorProvider
  listItems(token: string, query: ConnectorItemsQuery): Promise<ConnectorItemsPage>
  /** Every supported file under the folders, at most `KNOWLEDGE_CONNECTOR_FILES_MAX`. */
  listFiles(token: string, folders: KnowledgeConnectorConfig['folders']): Promise<ConnectorFile[]>
  fetch(token: string, file: ConnectorFile): Promise<ConnectorContent>
}

/** The provider refused the access token (401): the sign-in expired, the sync pauses. */
export class ConnectorExpiredError extends Error {
  constructor() {
    super('the provider refused the sign-in')
    this.name = 'ConnectorExpiredError'
  }
}

/** Nothing usable answered (network, timeout, rate limit, 5xx): the job retries with backoff. */
export class ConnectorUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConnectorUnavailableError'
  }
}

/** The provider answered with a client error for one item (gone, no access, too large). */
export class ConnectorItemError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ConnectorItemError'
  }
}
