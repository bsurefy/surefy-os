// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import ChatList from './ChatList'
import { agentsDomain, resetAgentsMock, SUPPORT_AGENT_ID } from '../../../../mock/handlers/agents'
import { chatDomain, resetChatMock } from '../../../../mock/handlers/chat'
import { SHARED_CHAT_IDS } from '../../../../mock/handlers/chat.shares'
import { dataControlDomain, resetDataControlMock } from '../../../../mock/handlers/dataControl'

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useParams: () => ({ orgSlug: 'acme' }),
  usePathname: () => '/acme/chat',
  useRouter: () => ({ push: mockPush }),
}))

const server = setupTestServer(
  ...chatDomain.handlers,
  ...agentsDomain.handlers,
  ...dataControlDomain.handlers,
)

function renderList() {
  return renderWithProviders(<ChatList />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs('user')),
  })
}

function useScenario(scenario: string) {
  server.events.on('request:start', ({ request }) => {
    request.headers.set('x-mock-scenario', scenario)
  })
}

const rowMenu = (title: string) => screen.findByRole('button', { name: `Actions for ${title}` })

beforeEach(() => {
  mockPush.mockClear()
  resetChatMock()
  resetAgentsMock()
  resetDataControlMock()
})

afterEach(() => {
  server.events.removeAllListeners()
})

describe('ChatList: agents and sharing', () => {
  it('lists the agents shared with the person, each starting a new chat', async () => {
    renderList()
    const agents = await screen.findByRole('region', { name: 'Agents shared with you' })
    expect(within(agents).getByRole('link', { name: 'Support triage' })).toHaveAttribute(
      'href',
      `/acme/chat?agent=${SUPPORT_AGENT_ID}`,
    )
    // agent chats are marked in the list
    expect(await screen.findByLabelText('Agent: Support triage')).toBeVisible()
  })

  it('hides "Agents shared with you" while there are none', async () => {
    useScenario('no-usable-agents')
    renderList()
    await screen.findByRole('region', { name: 'Pinned' })
    expect(screen.queryByRole('region', { name: 'Agents shared with you' })).not.toBeInTheDocument()
  })

  it('lists the chats shared with the person with who owns them', async () => {
    renderList()
    const shared = await screen.findByRole('region', { name: 'Shared with me' })
    const link = within(shared).getByRole('link', { name: /Launch plan for v2/ })
    expect(link).toHaveAttribute('href', `/acme/chat/${SHARED_CHAT_IDS.launch}`)
    expect(link).toHaveTextContent('From Omar Haddad')
  })

  it('shares a chat from its row menu', async () => {
    const { user } = renderList()
    await user.click(await rowMenu('Pricing page copy'))
    await user.click(await screen.findByRole('menuitem', { name: 'Share' }))
    const dialog = await screen.findByRole('dialog', { name: /Share “Pricing page copy”/ })
    expect(await within(dialog).findByText('Not shared yet')).toBeVisible()
  })

  it('names who loses access before a shared chat is deleted, and nothing happens on Cancel', async () => {
    const { user } = renderList()
    await user.click(await rowMenu('Quarterly report summary'))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText(/4 people will lose access/)).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
    expect(screen.getByRole('link', { name: /Quarterly report summary/ })).toBeVisible()
  })

  it('exports a chat without its sources', async () => {
    let params: unknown
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST' && request.url.endsWith('/exports')) {
        void request
          .clone()
          .json()
          .then((json: { params?: unknown }) => {
            params = json.params
          })
      }
    })
    const { user } = renderList()
    await user.click(await rowMenu('Pricing page copy'))
    await user.click(await screen.findByRole('menuitem', { name: 'Export' }))
    const dialog = await screen.findByRole('dialog', { name: 'Export chat' })
    await user.click(within(dialog).getByRole('switch', { name: 'Include sources' }))
    await user.click(within(dialog).getByRole('button', { name: 'Start export' }))
    await waitFor(() => {
      expect(params).toMatchObject({ format: 'pdf', includeSources: false })
    })
  })
})
