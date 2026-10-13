// SPDX-License-Identifier: AGPL-3.0-only
import { parseModelKey } from '@surefy/contracts'

import type { RunSession } from './agentRuns.session.js'
import type { PiiFilterInput } from '@/modules/guard/index.js'

/**
 * Who the personal-data filter applies for in this run: the agent's exceptions and the Guard
 * teams (the starter's, else the owner's). A local model keeps the data on the organization's
 * network, so the filter skips it.
 */
export function piiScopeOf(session: RunSession): Omit<PiiFilterInput, 'texts'> {
  return {
    orgId: session.orgId,
    teamIds: session.guardTeamIds,
    agentId: session.agent.id,
    dataLocation:
      parseModelKey(session.definition.model.modelKey)?.source === 'local' ? 'local' : 'cloud',
    requestId: session.runId,
  }
}

/** Where a model call's data went, from the model's source (`agent_run_steps.data_location`). */
export const dataLocationOf = (source: string): 'local' | 'provider' | 'platform' =>
  source === 'local' || source === 'platform' ? source : 'provider'
