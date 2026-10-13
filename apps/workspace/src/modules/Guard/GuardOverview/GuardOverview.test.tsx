// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import GuardOverview from './GuardOverview'
import { guardDomain } from '../../../../mock/handlers/guard'

vi.mock('next/navigation', () => ({ useParams: () => ({ orgSlug: 'acme' }) }))

const server = setupTestServer(...guardDomain.handlers)

function renderOverview(role: 'owner' | 'admin' | 'builder' = 'admin', searchParams?: string) {
  return renderWithProviders(<GuardOverview />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs(role)),
    searchParams,
  })
}

/** Forces a scenario on every mocked request of this test. */
function useScenario(scenario: string) {
  server.events.on('request:start', ({ request }) => {
    request.headers.set('x-mock-scenario', scenario)
  })
}

afterEach(() => {
  server.events.removeAllListeners()
})

describe('GuardOverview', () => {
  it('shows how actions were checked, with each band as a share of the checked actions', async () => {
    renderOverview()
    const auto = (await screen.findByText('Ran automatically')).closest('div')
    expect(auto).toHaveTextContent('812')
    expect(auto).toHaveTextContent('80% of checked actions')
    expect(screen.getByText('AI double-checked').closest('div')).toHaveTextContent('143')
    expect(screen.getByText('Needed a person').closest('div')).toHaveTextContent('61')
  })

  it('shows what limits blocked, the data hidden, local calls and the median time to approve', async () => {
    renderOverview()
    expect((await screen.findByText('Blocked by limits')).closest('div')).toHaveTextContent('9')
    expect(screen.getByText('Personal data hidden').closest('div')).toHaveTextContent('27')
    expect(screen.getByText('Ran on local models').closest('div')).toHaveTextContent('118')
    expect(screen.getByText('Median time to approve').closest('div')).toHaveTextContent(
      '14 minutes',
    )
  })

  it('lists what needs attention with links to the queue, the rule and the agent', async () => {
    renderOverview()
    const section = within(await screen.findByRole('region', { name: 'Needs your attention' }))
    expect(section.getByText('3 approvals have waited longer than the target time')).toBeVisible()
    expect(section.getByRole('link', { name: 'Review approvals' })).toHaveAttribute(
      'href',
      '/acme/insights/approvals',
    )
    expect(section.getByRole('link', { name: 'Open rule' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/acme\/guard\/guardrails\?rule=/),
    )
    expect(section.getByRole('link', { name: 'Open agent' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/acme\/agents\/.+\/guard$/),
    )
  })

  it('links to the approvals queue and never lists approvals itself', async () => {
    renderOverview()
    expect(await screen.findByRole('link', { name: 'Open approvals queue' })).toHaveAttribute(
      'href',
      '/acme/insights/approvals',
    )
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('asks for the other period and keeps it in the address', async () => {
    renderOverview()
    await screen.findByText('Ran automatically')
    await userEvent.click(screen.getByRole('radio', { name: 'Last 30 days' }))
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Last 30 days' })).toBeChecked()
    })
  })

  it('invites use on a fresh install', async () => {
    useScenario('empty')
    renderOverview()
    expect(await screen.findByText('No checks yet')).toBeVisible()
    expect(screen.queryByText('Ran automatically')).not.toBeInTheDocument()
  })

  it('offers a retry when the overview cannot load', async () => {
    useScenario('error')
    renderOverview()
    expect(await screen.findByText("Couldn't load the Guard overview")).toBeVisible()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible()
  })
})
