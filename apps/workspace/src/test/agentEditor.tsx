// SPDX-License-Identifier: AGPL-3.0-only
import { cleanup, waitFor } from '@testing-library/react'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import type { AgentDefinition, OrgRole } from '@surefy/contracts'
import { renderWithProviders } from '@surefy/web-core/testing'

import { agentRunsDomain } from '../../mock/handlers/agentRuns'
import { agentsDomain } from '../../mock/handlers/agents'
import { approvalsDomain } from '../../mock/handlers/approvals'
import { connectionsDomain } from '../../mock/handlers/connections'
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
  ...agentRunsDomain.handlers,
  ...approvalsDomain.handlers,
  ...connectionsDomain.handlers,
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

/** How long the mock server must stay idle before the next test may reset it. */
const QUIET_MS = 50

/**
 * Unmounts the editor and waits until the save it makes on leaving has reached the mock server.
 * Without it, that save can land after the next test resets the mock, move the draft's revision
 * and turn the next test's own save into a conflict.
 */
export async function leaveAgentEditor(server: SetupServer): Promise<void> {
  const open = new Set<string>()
  let lastActivityAt = Date.now()
  const onStart = ({ requestId }: { requestId: string }) => {
    open.add(requestId)
    lastActivityAt = Date.now()
  }
  const onEnd = ({ requestId }: { requestId: string }) => {
    open.delete(requestId)
    lastActivityAt = Date.now()
  }
  server.events.on('request:start', onStart)
  server.events.on('request:end', onEnd)
  try {
    cleanup()
    await waitFor(() => {
      if (open.size > 0 || Date.now() - lastActivityAt < QUIET_MS) {
        throw new Error('The mock server is still handling the editor requests')
      }
    })
  } finally {
    server.events.removeListener('request:start', onStart)
    server.events.removeListener('request:end', onEnd)
  }
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
