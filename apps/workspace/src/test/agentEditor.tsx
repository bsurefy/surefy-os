// SPDX-License-Identifier: AGPL-3.0-only
import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import type { AgentDefinition, OrgRole } from '@surefy/contracts'
import { renderWithProviders } from '@surefy/web-core/testing'

import { agentsDomain } from '../../mock/handlers/agents'
import { guardDomain } from '../../mock/handlers/guard'
import { knowledgeDomain } from '../../mock/handlers/knowledge'
import { membersDomain } from '../../mock/handlers/members'
import { modelsDomain } from '../../mock/handlers/models'
import { teamsDomain } from '../../mock/handlers/teams'
import { vaultDomain } from '../../mock/handlers/vault'
import AgentEditor from '../modules/Agents/AgentEditor'

import type { SetupServer } from 'msw/node'

/** The mock handlers an agent editor test needs. */
export const agentEditorHandlers = [
  ...agentsDomain.handlers,
  ...modelsDomain.handlers,
  ...guardDomain.handlers,
  ...knowledgeDomain.handlers,
  ...membersDomain.handlers,
  ...teamsDomain.handlers,
  ...vaultDomain.handlers,
]

/** Renders the editor as the organization layout does, as a Builder unless told otherwise. */
export function renderAgentEditor(role: OrgRole = 'builder') {
  return renderWithProviders(<AgentEditor />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs(role)),
  })
}

/**
 * Forces a scenario on the requests of one method for the rest of the test (`GET` also fails under
 * `error`); `pathPart` narrows it to the requests whose path contains it (`/versions`).
 */
export function useScenarioFor(
  server: SetupServer,
  method: string,
  scenario: string,
  pathPart = '',
) {
  server.events.on('request:start', ({ request }) => {
    if (request.method === method && new URL(request.url).pathname.includes(pathPart)) {
      request.headers.set('x-mock-scenario', scenario)
    }
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

/** Changes the draft the mock server holds, as another session would have saved it before the editor opens. */
export async function updateSavedDraft(
  agentId: string,
  change: (definition: AgentDefinition) => AgentDefinition,
): Promise<void> {
  const saved = await readSavedAgent(agentId)
  await fetch(`http://localhost:3000/api/v1/orgs/${ORG_ID}/agents/${agentId}/draft`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      baseRevision: saved.draft.revision,
      definition: change(saved.draft.definition),
    }),
  })
}
