// SPDX-License-Identifier: AGPL-3.0-only
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import type { EffectiveAccessDto, OrgRole } from '@surefy/contracts'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import ChatThread from './ChatThread'
import { agentsDomain, resetAgentsMock } from '../../../../mock/handlers/agents'
import { chatDomain, resetChatMock, SEEDED_CHAT_IDS } from '../../../../mock/handlers/chat'
import { setMockStreamDelay } from '../../../../mock/handlers/chat.messages'
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

function openChat(
  chatId: string | undefined,
  role: OrgRole = 'owner',
  access: Partial<EffectiveAccessDto> = {},
) {
  routeParams = { orgSlug: 'acme', chatId }
  return renderWithProviders(<ChatThread />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs(role, access)),
  })
}

/** The JSON body of every message request of this test. */
function recordBodies() {
  const bodies: Record<string, unknown>[] = []
  server.events.on('request:start', async ({ request }) => {
    if (request.method === 'POST' && request.url.endsWith('/messages')) {
      bodies.push((await request.clone().json()) as Record<string, unknown>)
    }
  })
  return bodies
}

vi.setConfig({ testTimeout: 20_000 })
const STREAM_WAIT = { timeout: 8000 }

beforeEach(() => {
  mockReplace.mockClear()
  mockPush.mockClear()
  window.localStorage.clear()
  recognitions.length = 0
  resetChatMock()
  resetAgentsMock()
  resetModelsMock()
  resetKnowledgeMock()
  resetVaultMock()
  resetSetupChecklistMock()
  setMockStreamDelay(0)
})

afterEach(() => {
  server.events.removeAllListeners()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('ChatThread: web search', () => {
  it('asks for web search with the message and cites what it found', async () => {
    const bodies = recordBodies()
    const { user } = openChat(undefined)
    await screen.findByRole('heading', { name: 'What can I help with today?' })
    const toggle = screen.getByRole('button', { name: 'Search the web' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')

    await user.type(screen.getByLabelText('Message'), 'Are refunds common?{Enter}')
    const answer = await screen.findByRole('article', { name: 'Answer' }, STREAM_WAIT)
    await waitFor(() => {
      expect(within(answer).getByText(/Searching the web, most vendors refund/)).toBeVisible()
    }, STREAM_WAIT)
    expect(bodies[0]).toMatchObject({ trigger: 'submit', webSearch: true })
    expect(within(answer).getByText('1 step')).toBeInTheDocument()
    expect(
      within(answer).getByText(/Searched the web for “Are refunds common\?”/),
    ).toBeInTheDocument()
    const sources = await within(answer).findByRole('region', { name: 'Sources' })
    expect(within(sources).getByText('Annual subscription refunds explained')).toBeVisible()
  })

  it('does not ask for web search while the toggle is off', async () => {
    const bodies = recordBodies()
    const { user } = openChat(undefined)
    await screen.findByRole('heading', { name: 'What can I help with today?' })
    await user.type(screen.getByLabelText('Message'), 'Hello{Enter}')
    await screen.findByRole('article', { name: 'Answer' }, STREAM_WAIT)
    expect(bodies[0]).not.toHaveProperty('webSearch')
  })

  it('is hidden when the team may not search the web', async () => {
    openChat(undefined, 'user', {
      tools: { webSearch: false, bridge: true, mcp: true, apiTools: true },
    })
    await screen.findByRole('heading', { name: 'What can I help with today?' })
    expect(screen.queryByRole('button', { name: 'Search the web' })).not.toBeInTheDocument()
  })

  it('says when an answer was written without the search', async () => {
    forceScenario('web-search-skipped')
    const { user } = openChat(undefined)
    await screen.findByRole('heading', { name: 'What can I help with today?' })
    await user.click(screen.getByRole('button', { name: 'Search the web' }))
    await user.type(screen.getByLabelText('Message'), 'Hello{Enter}')
    await waitFor(() => {
      expect(screen.getByText("Web search didn't work · answered without it")).toBeVisible()
    }, STREAM_WAIT)
  })
})

describe('ChatThread: compare', () => {
  it('answers with two models side by side and continues with the chosen one', async () => {
    const bodies = recordBodies()
    const { user } = openChat(SEEDED_CHAT_IDS.refunds)
    await screen.findByRole('article', { name: 'Answer' })
    await user.click(await screen.findByRole('button', { name: 'Compare models' }))
    await user.click(await screen.findByRole('option', { name: /Claude Sonnet 4/ }))
    expect(screen.getByRole('button', { name: 'Compare models' })).toHaveTextContent(
      'vs Claude Sonnet 4',
    )

    await user.type(screen.getByLabelText('Message'), 'And monthly plans?{Enter}')
    const group = await screen.findByRole(
      'group',
      { name: 'Comparison of two answers' },
      STREAM_WAIT,
    )
    const columnA = within(group).getByRole('region', { name: 'Answer A' })
    const columnB = within(group).getByRole('region', { name: 'Answer B' })
    await waitFor(() => {
      expect(within(columnA).getByText(/You asked/)).toBeVisible()
      expect(within(columnB).getByText(/You asked/)).toBeVisible()
    }, STREAM_WAIT)
    expect(bodies[0]).toMatchObject({ trigger: 'submit' })
    await waitFor(() => {
      expect(bodies[1]).toMatchObject({ trigger: 'compare', modelKey: 'anthropic/claude-sonnet-4' })
    })

    // once both are stored, the figures and the choice show up; the next message waits
    const chooseB = () => screen.getByRole('button', { name: 'Continue with B' })
    await waitFor(() => {
      expect(chooseB()).toBeEnabled()
    }, STREAM_WAIT)
    expect(screen.getAllByText((text) => text.includes(' in / '))).toHaveLength(2)
    await user.type(screen.getByLabelText('Message'), 'Next')
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
    expect(screen.getByText('Choose answer A or B to continue the chat.')).toBeVisible()

    await user.click(chooseB())
    await waitFor(() => {
      expect(
        screen.queryByRole('group', { name: 'Comparison of two answers' }),
      ).not.toBeInTheDocument()
    }, STREAM_WAIT)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled()
    })
  })

  it('stops comparing from the popover', async () => {
    const { user } = openChat(SEEDED_CHAT_IDS.refunds)
    await screen.findByRole('article', { name: 'Answer' })
    await user.click(await screen.findByRole('button', { name: 'Compare models' }))
    await user.click(await screen.findByRole('option', { name: /Claude Sonnet 4/ }))
    await user.click(screen.getByRole('button', { name: 'Compare models' }))
    await user.click(await screen.findByRole('button', { name: 'Stop comparing' }))
    expect(screen.getByRole('button', { name: 'Compare models' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })
})

describe('ChatThread: prompt library', () => {
  it('puts a prompt without variables in the composer', async () => {
    const { user } = openChat(undefined)
    await screen.findByRole('heading', { name: 'What can I help with today?' })
    await user.click(screen.getByRole('button', { name: 'Prompt library' }))
    const dialog = await screen.findByRole('dialog', { name: 'Prompt library' })
    await user.click(
      await within(dialog).findByRole('button', { name: 'Use prompt Explain simply' }),
    )
    expect(screen.getByLabelText('Message')).toHaveValue(
      'Explain this as if I were new to the topic.',
    )
    expect(screen.queryByRole('dialog', { name: 'Prompt library' })).not.toBeInTheDocument()
  })

  it('asks for the variables of a prompt before using it', async () => {
    const { user } = openChat(undefined)
    await screen.findByRole('heading', { name: 'What can I help with today?' })
    await user.type(screen.getByLabelText('Message'), 'Context first.')
    await user.click(screen.getByRole('button', { name: 'Prompt library' }))
    const library = await screen.findByRole('dialog', { name: 'Prompt library' })
    await user.click(
      await within(library).findByRole('button', { name: 'Use prompt Summarize a document' }),
    )
    const fill = await screen.findByRole('dialog', { name: 'Use “Summarize a document”' })
    await user.type(within(fill).getByLabelText('document'), 'the report')
    await user.type(within(fill).getByLabelText('count'), '3')
    await user.click(within(fill).getByRole('button', { name: 'Use prompt' }))
    // the empty variable keeps its placeholder; the text goes below what was written
    expect(screen.getByLabelText('Message')).toHaveValue(
      'Context first.\n\nSummarize the report in 3 bullet points for {audience}.',
    )
  })
})

/** The speech recognition the component started last. */
const recognitions: FakeRecognition[] = []
const lastRecognition = () => recognitions.at(-1)

/** A browser speech recognition that tests drive by hand. */
class FakeRecognition {
  lang = ''
  continuous = false
  interimResults = false
  onresult: ((event: unknown) => void) | null = null
  onerror: ((event: { error: string }) => void) | null = null
  onend: (() => void) | null = null
  start = vi.fn()
  stop = vi.fn(() => {
    this.onend?.()
  })
  abort = vi.fn()
  constructor() {
    recognitions.push(this)
  }

  hear(...phrases: string[]) {
    this.onresult?.({
      resultIndex: 0,
      results: phrases.map((transcript) => ({ isFinal: true, 0: { transcript } })),
    })
  }
}

describe('ChatThread: voice input', () => {
  it('is hidden when the browser cannot recognize speech', async () => {
    openChat(undefined)
    await screen.findByRole('heading', { name: 'What can I help with today?' })
    expect(screen.queryByRole('button', { name: 'Start dictating' })).not.toBeInTheDocument()
  })

  it('dictates into the composer after the first-use notice, and keeps the text editable', async () => {
    vi.stubGlobal('webkitSpeechRecognition', FakeRecognition)
    const { user } = openChat(undefined)
    await screen.findByRole('heading', { name: 'What can I help with today?' })
    await user.type(screen.getByLabelText('Message'), 'Please')
    await user.click(screen.getByRole('button', { name: 'Start dictating' }))
    expect(
      await screen.findByText(
        'Your browser may send audio to its own speech service to turn it into text.',
      ),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(lastRecognition()?.start).toHaveBeenCalled()

    act(() => {
      lastRecognition()?.hear('summarize', 'the report')
    })
    expect(screen.getByLabelText('Message')).toHaveValue('Please summarize the report')
    await user.click(screen.getByRole('button', { name: 'Stop dictating' }))
    await user.type(screen.getByLabelText('Message'), ' today')
    expect(screen.getByLabelText('Message')).toHaveValue('Please summarize the report today')

    // the notice is shown once
    await user.click(screen.getByRole('button', { name: 'Start dictating' }))
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument()
    expect(lastRecognition()?.start).toHaveBeenCalled()
  })

  it('says so when the microphone is blocked', async () => {
    vi.stubGlobal('webkitSpeechRecognition', FakeRecognition)
    window.localStorage.setItem('surefy.chat.voiceNoticeSeen', 'true')
    const { user } = openChat(undefined)
    await screen.findByRole('heading', { name: 'What can I help with today?' })
    await user.click(screen.getByRole('button', { name: 'Start dictating' }))
    fireEvent.click(document.body)
    act(() => {
      lastRecognition()?.onerror?.({ error: 'not-allowed' })
    })
    expect(await screen.findByRole('alert')).toHaveTextContent(/microphone is blocked/)
  })
})
