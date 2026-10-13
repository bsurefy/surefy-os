// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { agentRunsApi } from '@/api/agentRuns'
import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import type { AgentRunDto, AgentRunStatus } from '@surefy/contracts'
import { apiClient } from '@surefy/web-core/http'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import RunDetail from './RunDetail'
import { agentRunsDomain, setRunStreamDelay } from '../../../../../mock/handlers/agentRuns'
import { agentsDomain, resetAgentsMock } from '../../../../../mock/handlers/agents'
import { guardDomain, resetGuardMock } from '../../../../../mock/handlers/guard'

let mockRunId = ''
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useParams: () => ({ orgSlug: 'acme', runId: mockRunId }),
  useRouter: () => ({ push: mockPush }),
}))

const server = setupTestServer(
  ...agentRunsDomain.handlers,
  ...agentsDomain.handlers,
  ...guardDomain.handlers,
)

/** The newest seeded run with this status. */
async function seededRun(status: AgentRunStatus): Promise<AgentRunDto> {
  const page = await agentRunsApi.listAll(apiClient, ORG_ID, { status, limit: 100 })
  const run = page.items[0]
  if (!run) throw new Error(`no ${status} run`)
  return run
}

function renderRun(runId: string, role: 'admin' | 'builder' = 'admin') {
  mockRunId = runId
  return renderWithProviders(<RunDetail />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs(role)),
  })
}

beforeEach(() => {
  resetAgentsMock()
  resetGuardMock()
  setRunStreamDelay(0)
  mockPush.mockReset()
})

afterEach(() => {
  server.events.removeAllListeners()
})

describe('RunDetail', () => {
  it('shows the facts, the step waterfall and why the run did what it did', async () => {
    const run = await seededRun('succeeded')
    const { user } = renderRun(run.id)
    expect(
      await screen.findByRole('heading', { name: `Run ${run.id.slice(-8)}`, level: 1 }),
    ).toBeVisible()
    expect(screen.getByText('Done')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Support triage' })).toHaveAttribute(
      'href',
      `/acme/agents/${run.agent?.id ?? ''}`,
    )
    expect(screen.getByText('Data location').nextElementSibling).toHaveTextContent('AI provider')
    const steps = await screen.findByRole('list', { name: 'Steps' })
    expect(within(steps).getAllByRole('listitem').length).toBeGreaterThan(1)
    const about = screen.getByRole('complementary', { name: 'About this run' })
    expect(within(about).getByText(/ships within two business days/)).toBeVisible()

    await user.click(
      within(steps).getAllByRole('button', { name: /Show the input and output/ })[0] ??
        document.body,
    )
    expect(await within(steps).findByText('Output')).toBeVisible()
  })

  it('explains a failed run and starts a re-run in test mode', async () => {
    const run = await seededRun('failed')
    const { user } = renderRun(run.id)
    expect(await screen.findByText('The run failed')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Re-run in test mode' }))
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        expect.stringMatching(/^\/acme\/insights\/runs\/[0-9a-f-]{36}$/),
      )
    })
    expect(mockPush).not.toHaveBeenCalledWith(`/acme/insights/runs/${run.id}`)
  })

  it('links a waiting run to its approval and stops it after a confirmation', async () => {
    const run = await seededRun('waiting_approval')
    const { user } = renderRun(run.id)
    expect(await screen.findByText('Waiting for a person')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Open approval' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/acme\/insights\/approvals\//),
    )
    const history = screen.getByRole('complementary', { name: 'About this run' })
    expect(await within(history).findByText('Waiting')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Stop run' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText(/Steps already done aren't undone/)).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Stop run' }))
    await waitFor(() => {
      expect(screen.getByText('Stopped')).toBeVisible()
    })
    expect(screen.queryByRole('button', { name: 'Stop run' })).not.toBeInTheDocument()
  })

  it('says when the run does not exist', async () => {
    renderRun('00000000-0000-4000-8000-00000000dead')
    expect(await screen.findByText("This run isn't available")).toBeVisible()
    expect(screen.getByRole('link', { name: 'Runs' })).toHaveAttribute(
      'href',
      '/acme/insights/runs',
    )
  })
})
