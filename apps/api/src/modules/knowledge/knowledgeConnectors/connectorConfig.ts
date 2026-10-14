// SPDX-License-Identifier: AGPL-3.0-only
import type { KnowledgeConnectorConfig, KnowledgeConnectorSyncEvery } from '@surefy/contracts'

import type { KnowledgeSourceRow } from '../knowledgeSources/knowledgeSources.repository.js'

const HOUR_MS = 3_600_000
const SYNC_EVERY_MS: Record<KnowledgeConnectorSyncEvery, number> = {
  hourly: HOUR_MS,
  daily: 24 * HOUR_MS,
}

/** When a connector source syncs next, from its last sync. */
export const nextConnectorSyncAfter = (every: KnowledgeConnectorSyncEvery, from: Date): Date =>
  new Date(from.getTime() + SYNC_EVERY_MS[every])

/** The connector config of a source row; null for files and links. */
export const connectorConfigOf = (row: Pick<KnowledgeSourceRow, 'config'>) =>
  row.config !== null && 'connector' in row.config ? row.config.connector : null

/** "Finance", or "Finance + 2 more" for several folders. */
export const defaultConnectorName = (folders: KnowledgeConnectorConfig['folders']): string => {
  const [first] = folders
  if (first === undefined) return 'Connector'
  return folders.length === 1 ? first.name : `${first.name} + ${String(folders.length - 1)} more`
}
