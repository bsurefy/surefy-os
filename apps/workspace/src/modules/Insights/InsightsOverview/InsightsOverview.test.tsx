// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import type { ProviderOptions } from '@surefy/web-core/testing'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import InsightsOverview from './InsightsOverview'
import { dataControlDomain, resetDataControlMock } from '../../../../mock/handlers/dataControl'
import { membersDomain, resetMembersMock } from '../../../../mock/handlers/members'
import { modelsDomain, resetModelsMock } from '../../../../mock/handlers/models'
import { resetTeamsMock, SUPPORT_TEAM_ID, teamsDomain } from '../../../../mock/handlers/teams'
import { usageDomain } from '../../../../mock/handlers/usage'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useParams: () => ({ orgSlug: 'acme' }),
  useRouter: () => ({ push: mockPush }),
}))

const server = setupTestServer(
  ...usageDomain.handlers,
  ...dataControlDomain.handlers,
  ...membersDomain.handlers,
  ...teamsDomain.handlers,
  ...modelsDomain.handlers,
)

function renderInsights({
  searchParams,
  onUrlUpdate,
}: { searchParams?: string; onUrlUpdate?: ProviderOptions['onUrlUpdate'] } = {}) {
  return renderWithProviders(<InsightsOverview />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs('admin')),
    searchParams,
    onUrlUpdate,
  })
}

/** Forces a scenario on every mocked request of this test. */
function useScenario(scenario: string) {
  server.events.on('request:start', ({ request }) => {
    request.headers.set('x-mock-scenario', scenario)
  })
}

/** The chart card with this heading. */
async function card(name: string): Promise<HTMLElement> {
  const section = (await screen.findByRole('heading', { name })).closest('section')
  if (!section) throw new Error(`no card ${name}`)
  return section
}

beforeEach(() => {
  resetDataControlMock()
  resetMembersMock()
  resetTeamsMock()
  resetModelsMock()
})

afterEach(() => {
  server.events.removeAllListeners()
  vi.restoreAllMocks()
})

describe('InsightsOverview', () => {
  it('shows the key numbers for the last 30 days', async () => {
    renderInsights()
    const kpis = await screen.findByRole('region', { name: 'Key numbers' })
    for (const label of ['Messages', 'Active people', 'Tokens', 'Cost this month']) {
      expect(within(kpis).getByText(label)).toBeVisible()
    }
    // three people used AI in the range; the API key is not a person
    await waitFor(() => {
      expect(within(kpis).getByText('Active people').parentElement).toHaveTextContent('3')
    })
    expect(screen.getByRole('combobox', { name: 'Date range' })).toHaveTextContent('Last 30 days')
    expect(await screen.findByText(/Includes usage up to/)).toBeVisible()
  })

  it('breaks cost down by team, with the calls that have no team', async () => {
    const { user } = renderInsights()
    const cost = await card('Cost by team')
    await user.click(await within(cost).findByRole('radio', { name: 'Table' }))
    const table = await within(cost).findByRole('table', { name: 'Cost per team' })
    await within(table).findByText('Support')
    expect(within(table).getByText('Sales')).toBeVisible()
    expect(within(table).getByText('No team')).toBeVisible()
    expect(within(cost).getByText(/^Total \$/)).toBeVisible()
  })

  it('shows local models at $0 on your hardware', async () => {
    const { user } = renderInsights({ searchParams: '?by=model' })
    const cost = await card('Cost by model')
    await user.click(await within(cost).findByRole('radio', { name: 'Table' }))
    const row = (await within(cost).findByText('llama3.1:70b')).closest('tr') as HTMLElement
    expect(within(row).getByText('$0 · on your hardware')).toBeVisible()
  })

  it('narrows the page to a group and switches the grouping', async () => {
    const onUrlUpdate = vi.fn()
    const { user } = renderInsights({ onUrlUpdate })
    const cost = await card('Cost by team')
    await user.click(await within(cost).findByRole('radio', { name: 'Table' }))
    await user.click(await within(cost).findByRole('button', { name: 'Show only Support' }))
    await waitFor(() => {
      expect(onUrlUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ queryString: `?team=${SUPPORT_TEAM_ID}` }),
      )
    })
    await user.click(within(cost).getByRole('radio', { name: 'Person' }))
    await waitFor(() => {
      const last = onUrlUpdate.mock.lastCall?.[0] as { queryString: string } | undefined
      expect(last?.queryString).toContain('by=person')
    })
  })

  it('lists tokens per day in the table view', async () => {
    const { user } = renderInsights({ searchParams: '?range=7d' })
    const tokens = await card('Tokens over time')
    await user.click(await within(tokens).findByRole('radio', { name: 'Table' }))
    const table = await within(tokens).findByRole('table', {
      name: 'Input and output tokens per day',
    })
    // seven days, plus the header row
    expect(within(table).getAllByRole('row')).toHaveLength(8)
    expect(within(table).getByRole('columnheader', { name: 'Input' })).toBeVisible()
  })

  it('invites a first chat when the organization has no usage', async () => {
    useScenario('empty')
    renderInsights()
    expect(await screen.findByText('Usage appears after the first chat')).toBeVisible()
    const { user } = { user: (await import('@testing-library/user-event')).default.setup() }
    await user.click(screen.getByRole('button', { name: 'Start a chat' }))
    expect(mockPush).toHaveBeenCalledWith('/acme/chat')
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
    expect(screen.queryByRole('region', { name: 'Key numbers' })).not.toBeInTheDocument()
  })

  it('shows restricted costs as a dash, never zero', async () => {
    useScenario('restricted')
    renderInsights()
    const kpis = await screen.findByRole('region', { name: 'Key numbers' })
    expect(await within(kpis).findByText('Restricted')).toBeVisible()
  })

  it('flags models without a known price', async () => {
    useScenario('unpriced')
    renderInsights()
    expect(await screen.findByText('Some costs are missing')).toBeVisible()
    expect(screen.getByText(/Claude Sonnet 4/)).toBeVisible()
  })

  it('keeps the key numbers when the charts fail, with a retry on each chart', async () => {
    useScenario('chart-error')
    renderInsights()
    expect(await screen.findByRole('region', { name: 'Key numbers' })).toBeVisible()
    const errors = await screen.findAllByText("This chart couldn't load")
    expect(errors).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: /try again/i }).length).toBeGreaterThanOrEqual(2)
  })

  it('exports the range and filters on screen as CSV after the personal-data notice', async () => {
    const created: unknown[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST' && request.url.endsWith('/exports')) {
        void request
          .clone()
          .json()
          .then((body: unknown) => created.push(body))
      }
    })
    const { user } = renderInsights({ searchParams: `?range=7d&team=${SUPPORT_TEAM_ID}` })
    await user.click(await screen.findByRole('button', { name: 'Export CSV' }))
    const dialog = await screen.findByRole('dialog', { name: 'Export usage' })
    expect(within(dialog).getByText('This file contains personal data')).toBeVisible()
    expect(within(dialog).getByText(/Range: Last 7 days/)).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Prepare export' }))
    await waitFor(() => {
      expect(created).toHaveLength(1)
    })
    const [body] = created as { kind: string; params: { format: string; filters: unknown } }[]
    expect(body?.kind).toBe('usage_csv')
    expect(body?.params.format).toBe('csv')
    expect(body?.params.filters).toEqual({ teamId: [SUPPORT_TEAM_ID] })
    await waitFor(() => {
      expect(within(dialog).queryByText('This file contains personal data')).not.toBeInTheDocument()
    })
  })
})
