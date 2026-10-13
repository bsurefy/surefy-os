// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import type { OrgRole } from '@surefy/contracts'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import AgentTemplates from './AgentTemplates'
import { agentsDomain, resetAgentsMock } from '../../../../mock/handlers/agents'

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useParams: () => ({ orgSlug: 'acme' }),
  useRouter: () => ({ push: mockPush }),
}))

const server = setupTestServer(...agentsDomain.handlers)

function renderTemplates(role: OrgRole = 'builder') {
  return renderWithProviders(<AgentTemplates />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs(role)),
  })
}

/** Forces a scenario on every mocked request of this test. */
function useScenario(scenario: string) {
  server.events.on('request:start', ({ request }) => {
    request.headers.set('x-mock-scenario', scenario)
  })
}

const cardOf = async (name: string) => {
  const card = (await screen.findByRole('heading', { name })).closest('li')
  if (!card) throw new Error(`No card for ${name}`)
  return card
}

beforeEach(() => {
  mockPush.mockClear()
  resetAgentsMock()
})

afterEach(() => {
  server.events.removeAllListeners()
})

describe('AgentTemplates', () => {
  it('lists the four templates and "Start from scratch"', async () => {
    renderTemplates()
    for (const name of ['Customer Support', 'HR Helper', 'Sales Assistant', 'Invoice Checker']) {
      expect(await screen.findByRole('heading', { name })).toBeVisible()
    }
    expect(screen.getByRole('heading', { name: 'Start from scratch' })).toBeVisible()
  })

  it('lists what a template sets up: tools, knowledge, Guard rules and the suggested model', async () => {
    renderTemplates()
    const support = await cardOf('Customer Support')
    expect(support).toHaveTextContent('Order lookup')
    expect(support).toHaveTextContent('Refund API')
    expect(support).toHaveTextContent('Can act')
    expect(support).toHaveTextContent('Suggests attaching Your support articles')
    expect(support).toHaveTextContent('Refunds over $200 need approval')
    expect(support).toHaveTextContent('GPT-4.1')
    expect(await cardOf('Invoice Checker')).toHaveTextContent('You choose the model')
  })

  it('marks tools that are not connected and bridges that are not installed', async () => {
    renderTemplates('admin')
    const support = await cardOf('Customer Support')
    expect(within(support).getByText('Not connected')).toBeVisible()
    expect(within(support).getByText('Bridge not installed')).toBeVisible()
    expect(within(support).getByText('An admin installs it in Bridge')).toBeVisible()
  })

  it('tells a Builder to ask an admin for a bridge that is not installed', async () => {
    renderTemplates('builder')
    const support = await cardOf('Customer Support')
    expect(within(support).getByText('Ask an admin to install it')).toBeVisible()
  })

  it('creates the agent from a template and opens its editor', async () => {
    const created: unknown[] = []
    server.events.on('request:start', async ({ request }) => {
      if (request.method === 'POST') created.push(await request.clone().json())
    })
    const { user } = renderTemplates()
    const support = await cardOf('Customer Support')
    await user.click(within(support).getByRole('button', { name: 'Use template' }))
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(expect.stringMatching(/^\/acme\/agents\/[\w-]+$/))
    })
    expect(created).toEqual([{ name: 'Customer Support', templateKey: 'customer_support' }])
  })

  it('starts from scratch without a template', async () => {
    const created: unknown[] = []
    server.events.on('request:start', async ({ request }) => {
      if (request.method === 'POST') created.push(await request.clone().json())
    })
    const { user } = renderTemplates()
    await user.click(await screen.findByRole('button', { name: 'Start from scratch' }))
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalled()
    })
    expect(created).toEqual([{ name: 'New agent' }])
  })

  it('keeps the person on the page and says why when creating fails', async () => {
    useScenario('limit-reached')
    const { user } = renderTemplates()
    const support = await cardOf('Customer Support')
    await user.click(within(support).getByRole('button', { name: 'Use template' }))
    expect(await screen.findByText("Couldn't create the agent")).toBeVisible()
    expect(mockPush).not.toHaveBeenCalled()
    expect(within(support).getByRole('button', { name: 'Use template' })).toBeEnabled()
  })

  it('does not let people who cannot create agents start one', async () => {
    renderTemplates('user')
    const support = await cardOf('Customer Support')
    expect(within(support).getByRole('button', { name: 'Use template' })).toBeDisabled()
  })
})
