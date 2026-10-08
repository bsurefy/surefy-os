// SPDX-License-Identifier: AGPL-3.0-only
import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import type { AgentDefinition } from '@surefy/contracts'
import { renderWithProviders } from '@surefy/web-core/testing'

import { agentsDomain } from '../../mock/handlers/agents'
import { knowledgeDomain } from '../../mock/handlers/knowledge'
import { modelsDomain } from '../../mock/handlers/models'
import { teamsDomain } from '../../mock/handlers/teams'
import { vaultDomain } from '../../mock/handlers/vault'
import AgentEditor from '../modules/Agents/AgentEditor'

import type { SetupServer } from 'msw/node'

/** The mock handlers an agent editor test needs. */
export const agentEditorHandlers = [
  ...agentsDomain.handlers,
  ...modelsDomain.handlers,
  ...knowledgeDomain.handlers,
  ...teamsDomain.handlers,
  ...vaultDomain.handlers,
]

/** Renders the editor as the organization layout does, as a Builder unless told otherwise. */
export function renderAgentEditor(role: 'owner' | 'admin' | 'builder' = 'builder') {
  return renderWithProviders(<AgentEditor />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs(role)),
  })
}

/** Forces a scenario on the requests of one method for the rest of the test (`GET` also fails under `error`). */
export function useScenarioFor(server: SetupServer, method: string, scenario: string) {
  server.events.on('request:start', ({ request }) => {
    if (request.method === method) request.headers.set('x-mock-scenario', scenario)
  })
}

export interface SavedAgent {
  name: string
  draft: { revision: number; definition: AgentDefinition }
}

/** The agent as the mock server holds it now: what autosave has saved so far. */
export async function readSavedAgent(agentId: string): Promise<SavedAgent> {
  const response = await fetch(`http://localhost:3000/api/v1/orgs/${ORG_ID}/agents/${agentId}`)
  return ((await response.json()) as { data: SavedAgent }).data
}
