// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import {
  KNOWLEDGE_CONNECTOR_PROVIDERS,
  KNOWLEDGE_CONNECTOR_SYNC_EVERY,
  knowledgeConnectorConfigSchema,
} from './sources.js'
import { searchQuery } from '../core/filters.js'

// Connector sources (V1): Google Drive folders and Notion pages synced into a knowledge base
// (database/knowledge.md §3, "Connector and link sync"; Knowledge › base detail › Sources). Routes,
// under /api/v1/orgs/:orgId/knowledge-bases/:baseId (people who can manage the base):
// GET /sources/connector-items · POST /sources/connectors.
// The rest is the MVP source routes: PATCH changes the folders and the schedule, POST …/sync is
// "Sync now", DELETE removes the source. The account is a connection (Settings › Connections,
// or added from the connector dialog); disconnecting it is T2 and moves its sources to Recently
// deleted. When the connection's sign-in expires, the next sync pauses the source with
// KNOWLEDGE_CONNECTION_EXPIRED and its passages stay searchable; reconnecting the connection
// (POST /connections/oauth/start with `reconnectConnectionId`) queues and syncs every paused
// source of that connection.

export type KnowledgeConnectorProvider = (typeof KNOWLEDGE_CONNECTOR_PROVIDERS)[number]
export type KnowledgeConnectorSyncEvery = (typeof KNOWLEDGE_CONNECTOR_SYNC_EVERY)[number]

/** The connection provider behind each connector (connection keys use hyphens). */
export const KNOWLEDGE_CONNECTOR_CONNECTION_PROVIDERS = {
  google_drive: 'google-drive',
  notion: 'notion',
} as const satisfies Record<KnowledgeConnectorProvider, string>

/** The connector a connection provider feeds; null for providers that are not knowledge connectors. */
export function knowledgeConnectorOf(
  connectionProviderKey: string,
): KnowledgeConnectorProvider | null {
  for (const provider of KNOWLEDGE_CONNECTOR_PROVIDERS)
    if (KNOWLEDGE_CONNECTOR_CONNECTION_PROVIDERS[provider] === connectionProviderKey)
      return provider
  return null
}

// ── Choosing folders ────────────────────────────────────────────────────────────────────────────

/** Drive folders; Notion pages and databases (a page syncs with its child pages). */
export const KNOWLEDGE_CONNECTOR_ITEM_KINDS = ['folder', 'page', 'database'] as const
export type KnowledgeConnectorItemKind = (typeof KNOWLEDGE_CONNECTOR_ITEM_KINDS)[number]

export const KNOWLEDGE_CONNECTOR_ITEMS_PAGE_SIZE = { default: 50, max: 100 } as const

/**
 * `GET …/sources/connector-items`: what the connection can see, one level at a time. No
 * `parentId` lists the top level (My Drive and shared drives; the pages shared with the Notion
 * integration). `cursor` is the provider's own page token, passed back unchanged. An expired
 * sign-in answers `409 KNOWLEDGE_CONNECTION_EXPIRED` ("Reconnect").
 */
export const listKnowledgeConnectorItemsQuerySchema = z.object({
  connectionId: z.uuid(),
  parentId: z.string().min(1).max(200).optional(),
  q: searchQuery,
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(KNOWLEDGE_CONNECTOR_ITEMS_PAGE_SIZE.max)
    .default(KNOWLEDGE_CONNECTOR_ITEMS_PAGE_SIZE.default),
  cursor: z.string().min(1).max(2000).optional(),
})
export type ListKnowledgeConnectorItemsQuery = z.infer<
  typeof listKnowledgeConnectorItemsQuerySchema
>

export const knowledgeConnectorItemDtoSchema = z.object({
  /** Drive folder id or Notion page id; what `folders[].externalId` stores. */
  externalId: z.string().min(1).max(200),
  name: z.string(),
  kind: z.enum(KNOWLEDGE_CONNECTOR_ITEM_KINDS),
  /** Expandable in the picker. */
  hasChildren: z.boolean(),
  /** "Shared drives › Finance", for search results outside the open level. */
  path: z.string().nullable(),
  /** Already synced by another source of this base. */
  inBase: z.boolean(),
})
export type KnowledgeConnectorItemDto = z.infer<typeof knowledgeConnectorItemDtoSchema>

export const knowledgeConnectorItemsDtoSchema = z.object({
  provider: z.enum(KNOWLEDGE_CONNECTOR_PROVIDERS),
  items: z.array(knowledgeConnectorItemDtoSchema),
  nextCursor: z.string().nullable(),
})
export type KnowledgeConnectorItemsDto = z.infer<typeof knowledgeConnectorItemsDtoSchema>

// ── Adding and changing a connector source ──────────────────────────────────────────────────────

const foldersSchema = knowledgeConnectorConfigSchema.shape.folders.min(1)

/**
 * `POST …/sources/connectors`: answers `201` with the `queued` source; the first sync starts at
 * once. The provider comes from the connection, which must be an active Google Drive or Notion
 * connection the person may use (KNOWLEDGE_CONNECTION_INVALID otherwise). The name defaults to the
 * first folder's name, with "+ {n} more".
 */
export const createKnowledgeConnectorSourceInputSchema = z.object({
  connectionId: z.uuid(),
  folders: foldersSchema,
  syncEvery: z.enum(KNOWLEDGE_CONNECTOR_SYNC_EVERY).default('daily'),
  name: z.string().trim().min(1).max(200).optional(),
})
export type CreateKnowledgeConnectorSourceInput = z.infer<
  typeof createKnowledgeConnectorSourceInputSchema
>
