// SPDX-License-Identifier: AGPL-3.0-only
import { act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { agentEditorHandlers, readSavedAgent } from '@/test/agentEditor'
import { ORG_ID } from '@/test/shell'
import type { AgentDetailDto } from '@surefy/contracts'
import { renderHookWithProviders, setupTestServer } from '@surefy/web-core/testing'

import { useAgentAutosave } from './AgentEditor.hooks'
import { resetAgentsMock, SUPPORT_AGENT_ID } from '../../../../mock/handlers/agents'

const server = setupTestServer(...agentEditorHandlers)

beforeEach(() => {
  localStorage.clear()
  resetAgentsMock()
})

afterEach(() => {
  server.events.removeAllListeners()
})

const agentUrl = `http://localhost:3000/api/v1/orgs/${ORG_ID}/agents/${SUPPORT_AGENT_ID}`

async function openAutosave() {
  const response = await fetch(agentUrl)
  const agent = ((await response.json()) as { data: AgentDetailDto }).data
  return renderHookWithProviders(
    () => useAgentAutosave({ orgId: ORG_ID, agent, isReadOnly: false }),
    { orgId: ORG_ID },
  )
}

describe('useAgentAutosave flush', () => {
  it('saves what is pending at once, and says which revision the draft is at', async () => {
    const { result } = await openAutosave()
    const before = (await readSavedAgent(SUPPORT_AGENT_ID)).draft.revision
    act(() => {
      result.current.onDefinitionChange((definition) => ({ ...definition, tone: 'Formal' }))
    })
    let revision: number | null = null
    await act(async () => {
      revision = await result.current.flush()
    })
    expect(revision).toBe(before + 1)
    expect((await readSavedAgent(SUPPORT_AGENT_ID)).draft.definition.tone).toBe('Formal')
  })

  it('has nothing to wait for when nothing was edited', async () => {
    const { result } = await openAutosave()
    const before = (await readSavedAgent(SUPPORT_AGENT_ID)).draft.revision
    let revision: number | null = null
    await act(async () => {
      revision = await result.current.flush()
    })
    expect(revision).toBe(before)
  })

  it('answers null when the latest edits could not be saved', async () => {
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'PUT') request.headers.set('x-mock-scenario', 'error')
    })
    const { result } = await openAutosave()
    act(() => {
      result.current.onDefinitionChange((definition) => ({ ...definition, tone: 'Formal' }))
    })
    let revision: number | null = 0
    await act(async () => {
      revision = await result.current.flush()
    })
    expect(revision).toBeNull()
    await waitFor(() => {
      expect(result.current.status.kind).toBe('error')
    })
  })
})

describe('useAgentAutosave adoptRevision', () => {
  it('bases the next save on the revision a publish left the draft at', async () => {
    const { result } = await openAutosave()
    const saved = await readSavedAgent(SUPPORT_AGENT_ID)
    // a publish bumps the revision without an edit of ours
    const published = await fetch(`${agentUrl}/publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseRevision: saved.draft.revision, channels: [] }),
    })
    expect(published.ok).toBe(true)
    const revision = (await readSavedAgent(SUPPORT_AGENT_ID)).draft.revision
    expect(revision).toBe(saved.draft.revision + 1)

    act(() => {
      result.current.adoptRevision(revision)
      result.current.onDefinitionChange((definition) => ({ ...definition, tone: 'Warm' }))
    })
    let flushed: number | null = null
    await act(async () => {
      flushed = await result.current.flush()
    })
    expect(flushed).toBe(revision + 1)
    expect(result.current.status.kind).toBe('saved')
  })
})
