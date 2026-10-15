// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import type { ProviderOptions } from '@surefy/web-core/testing'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import Runs from './Runs'
import { agentRunsDomain } from '../../../../mock/handlers/agentRuns'
import { agentsDomain, resetAgentsMock } from '../../../../mock/handlers/agents'
import { guardDomain, resetGuardMock } from '../../../../mock/handlers/guard'
import { modelsDomain, resetModelsMock } from '../../../../mock/handlers/models'
import { resetTeamsMock, teamsDomain } from '../../../../mock/handlers/teams'

vi.mock('next/navigation', () => ({
  useParams: () => ({ orgSlug: 'acme' }),
  useRouter: () => ({ push: vi.fn() }),
}))

const server = setupTestServer(
  ...agentRunsDomain.handlers,
  ...agentsDomain.handlers,
  ...guardDomain.handlers,
  ...modelsDomain.handlers,
  ...teamsDomain.handlers,
)

function renderRuns({
  searchParams,
  onUrlUpdate,
  role = 'admin',
}: {
  searchParams?: string
  onUrlUpdate?: ProviderOptions['onUrlUpdate']
  role?: 'admin' | 'builder'
} = {}) {
  return renderWithProviders(<Runs />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs(role)),
    searchParams,
    onUrlUpdate,
  })
}

/** The rows of the table once it has this many, without its header. */
async function expectRows(count: number) {
  await waitFor(() => {
    const table = screen.getByRole('table', { name: 'Runs' })
    expect(within(table).getAllByRole('row').slice(1)).toHaveLength(count)
  })
  return within(screen.getByRole('table', { name: 'Runs' }))
    .getAllByRole('row')
    .slice(1)
}

beforeEach(() => {
  resetAgentsMock()
  resetGuardMock()
  resetModelsMock()
  resetTeamsMock()
})

afterEach(() => {
  server.events.removeAllListeners()
})

describe('Runs', () => {
  it('lists the runs of every agent, newest first, each opening its detail', async () => {
    renderRuns()
    const rows = await expectRows(24)
    const newest = within(rows[0] ?? document.body)
    expect(newest.getByText('Support triage')).toBeVisible()
    expect(newest.getByText('Waiting for approval')).toBeVisible()
    expect(newest.getByText('Needed a person')).toBeVisible()
    expect(newest.getByText('v3')).toBeVisible()
    expect(screen.getAllByText('HR helper').length).toBeGreaterThan(0)
    const link = within(rows[0] ?? document.body).getAllByRole('link')[0]
    expect(link).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/acme\/insights\/runs\/[0-9a-f-]{36}$/),
    )
  })

  it('filters by status from the URL', async () => {
    renderRuns({ searchParams: '?status=failed' })
    const rows = await expectRows(2)
    for (const row of rows) expect(within(row).getByText('Failed')).toBeVisible()
  })

  it('searches by agent name', async () => {
    renderRuns({ searchParams: '?q=hr%20helper' })
    const rows = await expectRows(12)
    for (const row of rows) expect(within(row).getByText('HR helper')).toBeVisible()
  })

  it('sorts by cost from the column header', async () => {
    const onUrlUpdate = vi.fn()
    const { user } = renderRuns({ onUrlUpdate })
    await expectRows(24)
    await user.click(screen.getByRole('button', { name: /Cost/ }))
    await waitFor(() => {
      const last = onUrlUpdate.mock.lastCall?.[0] as { queryString: string } | undefined
      expect(last?.queryString).toMatch(/sort=-?costMicros/)
    })
  })

  it('says when no run matches, and clears the filters', async () => {
    const onUrlUpdate = vi.fn()
    const { user } = renderRuns({ searchParams: '?range=7d', onUrlUpdate })
    expect(await screen.findByText('No runs match')).toBeVisible()
    await user.click(screen.getAllByRole('button', { name: 'Clear filters' })[0] ?? document.body)
    await waitFor(() => {
      const last = onUrlUpdate.mock.lastCall?.[0] as { queryString: string } | undefined
      expect(last?.queryString).toBe('')
    })
  })

  it('invites an agent when the organization has no runs', async () => {
    server.events.on('request:start', ({ request }) => {
      if (new URL(request.url).pathname.endsWith('/runs')) {
        request.headers.set('x-mock-scenario', 'empty')
      }
    })
    renderRuns()
    expect(await screen.findByText('No runs yet')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Create an agent' })).toHaveAttribute(
      'href',
      '/acme/agents/new',
    )
  })
})
