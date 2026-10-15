// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import ChatThread from './ChatThread'
import { agentsDomain, resetAgentsMock, SUPPORT_AGENT_ID } from '../../../../mock/handlers/agents'
import { approvalsDomain, seedApprovalsMock } from '../../../../mock/handlers/approvals'
import { chatDomain, resetChatMock, SEEDED_CHAT_IDS } from '../../../../mock/handlers/chat'
import { setMockStreamDelay } from '../../../../mock/handlers/chat.messages'
import { SHARED_CHAT_IDS } from '../../../../mock/handlers/chat.shares'
import { knowledgeDomain, resetKnowledgeMock } from '../../../../mock/handlers/knowledge'
import { modelsDomain, resetModelsMock } from '../../../../mock/handlers/models'
import {
  resetSetupChecklistMock,
  setupChecklistDomain,
} from '../../../../mock/handlers/setupChecklist'
import { resetVaultMock, vaultDomain } from '../../../../mock/handlers/vault'

const mockReplace = vi.fn()
const mockPush = vi.fn()
let routeParams: { orgSlug: string; chatId?: string } = { orgSlug: 'acme' }
vi.mock('next/navigation', () => ({
  useParams: () => routeParams,
  useRouter: () => ({ push: mockPush, replace: mockReplace, refresh: vi.fn() }),
}))

const server = setupTestServer(
  ...chatDomain.handlers,
  ...agentsDomain.handlers,
  ...approvalsDomain.handlers,
  ...modelsDomain.handlers,
  ...knowledgeDomain.handlers,
  ...vaultDomain.handlers,
  ...setupChecklistDomain.handlers,
)

function forceScenario(scenario: string) {
  server.events.on('request:start', ({ request }) => {
    request.headers.set('x-mock-scenario', scenario)
  })
}

function openChat(chatId: string | undefined, searchParams?: string) {
  routeParams = { orgSlug: 'acme', chatId }
  return renderWithProviders(<ChatThread />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs('user')),
    searchParams,
  })
}

vi.setConfig({ testTimeout: 20_000 })
const STREAM_WAIT = { timeout: 8000 }

beforeEach(() => {
  mockReplace.mockClear()
  mockPush.mockClear()
  resetChatMock()
  resetAgentsMock()
  seedApprovalsMock()
  resetModelsMock()
  resetKnowledgeMock()
  resetVaultMock()
  resetSetupChecklistMock()
  setMockStreamDelay(0)
})

afterEach(() => {
  server.events.removeAllListeners()
  vi.restoreAllMocks()
})

describe('ChatThread: agents', () => {
  it('lists the shared agents in the picker and starts a chat with one', async () => {
    const { user } = openChat(undefined)
    await screen.findByRole('heading', { name: 'What can I help with today?' })
    await user.click(await screen.findByRole('button', { name: 'Model or agent' }))
    await user.click(await screen.findByRole('tab', { name: 'Agents' }))
    await user.click(await screen.findByRole('option', { name: /Support triage/ }))
    expect(await screen.findByRole('heading', { name: 'Support triage' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Where is my order?' })).toBeVisible()
    // an agent brings its own knowledge and takes no files
    expect(screen.queryByRole('button', { name: 'Knowledge scope' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add to message' })).not.toBeInTheDocument()
  })

  it('answers as the agent and shows the approval its run waits for', async () => {
    let body: unknown
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST' && request.url.endsWith('/messages')) {
        void request
          .clone()
          .json()
          .then((json: unknown) => {
            body = json
          })
      }
    })
    const { user } = openChat(undefined, `?agent=${SUPPORT_AGENT_ID}`)
    await user.click(await screen.findByRole('button', { name: 'How do I get a refund?' }))
    await user.click(screen.getByRole('button', { name: 'Send message' }))
    const answer = await screen.findByRole('article', { name: 'Answer' }, STREAM_WAIT)
    expect(await within(answer).findByText('Support triage', {}, STREAM_WAIT)).toBeVisible()
    expect(
      await within(answer).findByText('Waiting for approval by Finance', {}, STREAM_WAIT),
    ).toBeVisible()
    expect(body).toMatchObject({ trigger: 'submit', newChat: { agentId: SUPPORT_AGENT_ID } })
    expect(body).not.toHaveProperty('modelKey')
  })

  it('keeps the next message back while the run waits for an approval', async () => {
    openChat(SEEDED_CHAT_IDS.agentRefund)
    expect(await screen.findByText('Waiting for approval by Admins')).toBeVisible()
    expect(screen.getByText(/The agent is waiting for an approval/)).toBeVisible()
    // the agent of a chat that exists is fixed: the picker only names it
    expect(screen.queryByRole('button', { name: 'Model or agent' })).not.toBeInTheDocument()
    expect(screen.getAllByText('Support triage').length).toBeGreaterThan(0)
  })

  it('keeps the history of a chat whose agent is gone, without a composer', async () => {
    openChat(SEEDED_CHAT_IDS.agentGone)
    expect(
      await screen.findByText("Old invoice checker isn't available to you anymore"),
    ).toBeVisible()
    expect(screen.getByText('All 42 March invoices match their orders.')).toBeVisible()
    expect(screen.queryByLabelText('Message')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Start a chat with a model' })).toHaveAttribute(
      'href',
      '/acme/chat',
    )
  })

  it('says so when the agent in the address is not shared with the person', async () => {
    openChat(undefined, '?agent=0190a5c4-0000-7000-8000-000000000999')
    expect(await screen.findByText("This agent isn't available to you")).toBeVisible()
  })
})

describe('ChatThread: shared chats', () => {
  it('opens a chat shared with the person view only', async () => {
    openChat(SHARED_CHAT_IDS.launch)
    expect(await screen.findByText('Shared by Omar Haddad · view only')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Launch plan for v2' })).toBeVisible()
    const answer = await screen.findByRole('article', { name: 'Answer' })
    expect(within(answer).getByRole('button', { name: 'Copy answer' })).toBeVisible()
    expect(within(answer).queryByRole('button', { name: /Regenerate/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Message')).not.toBeInTheDocument()
  })

  it('shares the chat from the header with a person', async () => {
    const { user } = openChat(SEEDED_CHAT_IDS.quarterly)
    await screen.findAllByRole('article', { name: 'Answer' })
    await user.click(screen.getByRole('button', { name: 'Chat options' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Share' }))
    const dialog = await screen.findByRole('dialog', { name: /Share “Quarterly report summary”/ })
    expect(await within(dialog).findByText('4 people have access')).toBeVisible()
    expect(within(dialog).getByText('Support')).toBeVisible()
    await user.click(within(dialog).getByRole('combobox', { name: 'People and teams' }))
    await user.click(await screen.findByRole('option', { name: /Ana Ruiz/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Share' }))
    expect(await screen.findByText('Shared with 1 person or team')).toBeVisible()
    expect(await within(dialog).findByText('5 people have access')).toBeVisible()
  })

  it('explains that the organization turned sharing off', async () => {
    forceScenario('sharing-disabled')
    const { user } = openChat(SEEDED_CHAT_IDS.refunds)
    await screen.findByRole('article', { name: 'Answer' })
    await user.click(screen.getByRole('button', { name: 'Chat options' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Share' }))
    expect(await screen.findByText('Chat sharing is turned off')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument()
  })

  it('names who loses access before a shared chat is deleted', async () => {
    const { user } = openChat(SEEDED_CHAT_IDS.quarterly)
    await screen.findAllByRole('article', { name: 'Answer' })
    await user.click(screen.getByRole('button', { name: 'Chat options' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete chat' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText(/4 people will lose access/)).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Delete chat' }))
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/acme/chat')
    })
  })
})
