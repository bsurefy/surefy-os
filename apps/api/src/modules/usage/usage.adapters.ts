// SPDX-License-Identifier: AGPL-3.0-only
import type { UsageAgents } from './usage.types.js'
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
