// SPDX-License-Identifier: AGPL-3.0-only
import type { UsageAgents } from './usage.types.js'
import type { UsageMeter } from './usageMeter.js'
import type { Database } from '@/core/database/index.js'
import type { SearchUsage } from '@/integrations/search/index.js'
import type { AgentsRepository } from '@/modules/agents/index.js'

/** Insights' view of the agents: which ones a Builder edits, and their names (agents module). */
export function createUsageAgents(
  repository: Pick<AgentsRepository, 'editableIds' | 'namesIncludingDeleted'>,
): UsageAgents {
  return {
    editableIds: (tx, orgId, viewer) => repository.editableIds(tx, orgId, viewer),
    names: (tx, orgId, ids) => repository.namesIncludingDeleted(tx, orgId, ids),
  }
}

/** Web searches as metered calls (kind `web_search`): one `usage_events` row each, cost zero. */
export function createSearchUsage(
  db: Database,
  meter: Pick<UsageMeter, 'recordInTx'>,
): SearchUsage {
  return {
    async record(orgId, event) {
      await db.tenant(orgId, (tx) => meter.recordInTx(tx, orgId, event))
    },
  }
}
