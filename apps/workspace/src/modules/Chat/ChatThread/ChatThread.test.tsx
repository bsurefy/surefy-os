// SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import type { OrgRole } from '@surefy/contracts'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import ChatThread from './ChatThread'
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
  ...modelsDomain.handlers,
  ...knowledgeDomain.handlers,
  ...vaultDomain.handlers,
  ...setupChecklistDomain.handlers,
)

/** Forces a scenario on every mocked request of this test. */
function forceScenario(scenario: string) {
  server.events.on('request:start', ({ request }) => {
    request.headers.set('x-mock-scenario', scenario)
  })
}

function openChat(chatId: string | undefined, role: OrgRole = 'owner') {
  routeParams = { orgSlug: 'acme', chatId }
  return renderWithProviders(<ChatThread />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs(role)),
  })
}

// streamed answers and uploads take longer than a plain render
vi.setConfig({ testTimeout: 20_000 })
const STREAM_WAIT = { timeout: 8000 }

beforeEach(() => {
  mockReplace.mockClear()
  mockPush.mockClear()
  resetChatMock()
  resetModelsMock()
  resetKnowledgeMock()
  resetVaultMock()
  resetSetupChecklistMock()
  setMockStreamDelay(0)
})

afterEach(() => {
  server.events.removeAllListeners()
  vi.restoreAllMocks()
  // a test that went offline must not leave the query client's online state behind
  window.dispatchEvent(new Event('online'))
})

describe('ChatThread: new chat', () => {
  it('greets, offers four starters and the setup checklist', async () => {
    const { user } = openChat(undefined)
    expect(
      await screen.findByRole('heading', { name: 'What can I help with today?' }),
    ).toBeVisible()
    const starters = screen.getByRole('list', { name: 'Ways to start' })
    expect(within(starters).getAllByRole('button')).toHaveLength(4)
    expect(await screen.findByRole('region', { name: 'Finish setting up' })).toBeVisible()

    await user.click(within(starters).getByRole('button', { name: /Draft a message/ }))
    expect(screen.getByLabelText('Message')).toHaveValue(
      'Draft a short, friendly email to a customer about ',
    )
  })

  it('tells an Admin to connect a model, and everyone else to ask one', async () => {
    forceScenario('empty')
    const view = openChat(undefined, 'owner')
    expect(await screen.findByText('Connect a model to start chatting')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Open Vault' })).toHaveAttribute(
      'href',
      '/acme/settings/vault',
    )
    view.unmount()
    openChat(undefined, 'user')
    expect(await screen.findByText(/Your admin hasn't enabled any models yet/)).toBeVisible()
    expect(screen.queryByRole('link', { name: 'Open Vault' })).not.toBeInTheDocument()
  })

  it('streams the answer of a first message and then moves to the chat', async () => {
    let body: Record<string, unknown> = {}
    server.events.on('request:start', async ({ request }) => {
      if (request.method === 'POST' && request.url.endsWith('/messages')) {
        body = (await request.clone().json()) as Record<string, unknown>
      }
    })
    const { user } = openChat(undefined)
    await screen.findByRole('heading', { name: 'What can I help with today?' })
    await user.type(screen.getByLabelText('Message'), 'What is the refund policy?{Enter}')

    expect(await screen.findByText('What is the refund policy?')).toBeVisible()
    await waitFor(() => {
      expect(screen.getByText(/annual plans can be cancelled/)).toBeVisible()
    }, STREAM_WAIT)
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        expect.stringMatching(/^\/acme\/chat\/[0-9a-f-]{36}$/),
      )
    }, STREAM_WAIT)
    expect(body).toMatchObject({
      trigger: 'submit',
      text: 'What is the refund policy?',
      modelKey: 'openai/gpt-4.1',
      newChat: { knowledgeScope: 'all', isPrivate: false },
    })
  })
})

describe('ChatThread: history', () => {
  it('draws an answer with citation chips and a sources list, and opens the preview', async () => {
    const { user } = openChat(SEEDED_CHAT_IDS.refunds)
    const answer = await screen.findByRole('article', { name: 'Answer' })
    expect(within(answer).getByText(/within/)).toBeVisible()
    const sources = within(answer).getByRole('region', { name: 'Sources' })
    expect(within(sources).getAllByRole('button')).toHaveLength(2)

    await user.click(within(answer).getByRole('link', { name: '1' }))
    const preview = await screen.findByRole('dialog', { name: 'Refund policy.pdf' })
    expect(await within(preview).findByText(/Customers may cancel within 14 days/)).toBeVisible()
    expect(within(preview).getByText('Page 2')).toBeVisible()
  })

  it('says so when a cited source was removed', async () => {
    forceScenario('source-removed')
    const { user } = openChat(SEEDED_CHAT_IDS.refunds)
    const answer = await screen.findByRole('article', { name: 'Answer' })
    await user.click(within(answer).getByRole('button', { name: /Source 2/ }))
    const preview = await screen.findByRole('dialog', { name: 'Annual plans FAQ' })
    expect(await within(preview).findByText(/was removed from your knowledge/)).toBeVisible()
  })

  it('keeps reasoning and steps collapsed, shows code and the data location', async () => {
    openChat(SEEDED_CHAT_IDS.quarterly)
    expect(await screen.findByText(/Revenue grew in all three regions/)).toBeVisible()
    const reasoning = screen.getByText(/Reasoned for 3 seconds/).closest('details')
    expect(reasoning).not.toHaveAttribute('open')
    if (!reasoning) throw new Error('No reasoning block')
    // reasoning is Markdown: the list and the emphasis render as elements, not as raw text
    expect(within(reasoning).getByText('Compare them with last quarter.').tagName).toBe('LI')
    expect(within(reasoning).getByText('product').tagName).toBe('STRONG')
    expect(screen.getByText('1 step').closest('details')).not.toHaveAttribute('open')
    expect(screen.getByRole('button', { name: 'Copy' })).toBeVisible()
    expect((await screen.findAllByText('Sent to OpenAI')).length).toBeGreaterThan(0)
  })

  it('marks a model switch, a stopped answer and sources that were still processing', async () => {
    openChat(SEEDED_CHAT_IDS.quarterly)
    expect(await screen.findByRole('separator', { name: /Switched to GPT-4.1/ })).toBeVisible()
    expect(screen.getByText('Stopped')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeVisible()
  })

  it('shows "still processing" under an answer the knowledge could not fully serve', async () => {
    openChat(SEEDED_CHAT_IDS.onboarding)
    expect(
      await screen.findByText("2 sources are still processing and weren't searched"),
    ).toBeVisible()
  })

  it('is not available when the chat does not exist', async () => {
    openChat('00000000-0000-4000-8000-000000000000')
    expect(await screen.findByRole('heading', { name: "This chat isn't available" })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Go to Chat' })).toHaveAttribute('href', '/acme/chat')
  })
})

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

describe('ChatThread: answering', () => {
  it('stops an answer, keeps the partial text and offers Continue', async () => {
    setMockStreamDelay(30)
    const { user } = openChat(SEEDED_CHAT_IDS.refunds)
    await screen.findByRole('article', { name: 'Answer' })
    await user.type(screen.getByLabelText('Message'), 'Tell me more{Enter}')
    await user.click(await screen.findByRole('button', { name: 'Stop answering' }))
    expect(await screen.findByText('Stopped', {}, STREAM_WAIT)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
  })

  it('continues a stopped answer with a new request', async () => {
    const bodies = recordBodies()
    const { user } = openChat(SEEDED_CHAT_IDS.quarterly)
    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    await waitFor(() => {
      expect(bodies).toContainEqual(expect.objectContaining({ trigger: 'continue' }))
    }, STREAM_WAIT)
    await waitFor(() => {
      expect(screen.getByText(/the rest of the answer follows/)).toBeVisible()
    }, STREAM_WAIT)
  })

  it('regenerates the last answer in place', async () => {
    const bodies = recordBodies()
    const { user } = openChat(SEEDED_CHAT_IDS.refunds)
    await user.click(await screen.findByRole('button', { name: 'Regenerate answer' }))
    await waitFor(() => {
      expect(bodies).toContainEqual(expect.objectContaining({ trigger: 'regenerate' }))
    }, STREAM_WAIT)
    await waitFor(() => {
      expect(screen.getAllByRole('article', { name: 'Answer' })).toHaveLength(1)
    }, STREAM_WAIT)
  })

  it('edits the last message and sends it again as a new version', async () => {
    const bodies = recordBodies()
    const { user } = openChat(SEEDED_CHAT_IDS.refunds)
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    const box = screen.getByLabelText('Edit your message')
    await user.clear(box)
    await user.type(box, 'Can I get a refund after 20 days?')
    await user.click(screen.getByRole('button', { name: 'Save and resend' }))
    await waitFor(() => {
      expect(bodies).toContainEqual(
        expect.objectContaining({ trigger: 'edit', text: 'Can I get a refund after 20 days?' }),
      )
    }, STREAM_WAIT)
    expect(await screen.findByText('Can I get a refund after 20 days?')).toBeVisible()
  })

  it('opens the editor from ↑ in an empty composer', async () => {
    const { user } = openChat(SEEDED_CHAT_IDS.refunds)
    await screen.findByRole('article', { name: 'Answer' })
    await user.click(screen.getByLabelText('Message'))
    await user.keyboard('{ArrowUp}')
    expect(await screen.findByLabelText('Edit your message')).toBeVisible()
  })

  it('keeps Shift+Enter for a new line and sends on Enter', async () => {
    const bodies = recordBodies()
    const { user } = openChat(SEEDED_CHAT_IDS.refunds)
    await screen.findByRole('article', { name: 'Answer' })
    await user.type(screen.getByLabelText('Message'), 'one{Shift>}{Enter}{/Shift}two')
    expect(screen.getByLabelText('Message')).toHaveValue('one\ntwo')
    await user.keyboard('{Enter}')
    await waitFor(() => {
      expect(bodies).toContainEqual(expect.objectContaining({ text: 'one\ntwo' }))
    }, STREAM_WAIT)
  })

  it('answers without knowledge when the scope is none', async () => {
    const { user } = openChat(SEEDED_CHAT_IDS.refunds)
    await screen.findByRole('article', { name: 'Answer' })
    await user.click(screen.getByRole('button', { name: 'Knowledge scope' }))
    await user.click(await screen.findByRole('radio', { name: /No knowledge/ }))
    await user.type(screen.getByLabelText('Message'), 'Hello{Enter}')
    await waitFor(() => {
      expect(screen.getByText(/without searching your knowledge/)).toBeVisible()
    }, STREAM_WAIT)
  })
})

describe('ChatThread: failures', () => {
  async function sendWith(scenario: string) {
    forceScenario(scenario)
    const view = openChat(SEEDED_CHAT_IDS.refunds)
    await screen.findByRole('article', { name: 'Answer' })
    await view.user.type(screen.getByLabelText('Message'), 'Hello{Enter}')
    return view
  }

  it('keeps the message and offers Retry when the model is offline', async () => {
    await sendWith('model-offline')
    expect(await screen.findByText("The model isn't answering", {}, STREAM_WAIT)).toBeVisible()
    expect(screen.getByText(/Your message is saved; nothing was sent/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
    expect(screen.getByText('Hello')).toBeVisible()
  })

  it('offers a local model when the budget is reached', async () => {
    await sendWith('budget-reached')
    expect(await screen.findByText('Budget reached', {}, STREAM_WAIT)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Use a local model' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Open usage and budgets' })).toBeVisible()
  })

  it('counts down after a rate limit', async () => {
    await sendWith('rate-limited')
    expect(await screen.findByText(/Trying again in 10 seconds/, {}, STREAM_WAIT)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Retry now' })).toBeVisible()
  })

  it('keeps the partial answer of an interrupted stream with Retry', async () => {
    await sendWith('interrupted')
    expect(await screen.findByText('Answer interrupted', {}, STREAM_WAIT)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
  })
})

describe('ChatThread: rating, settings and offline', () => {
  it('rates an answer and takes a correction for "not helpful"', async () => {
    const { user } = openChat(SEEDED_CHAT_IDS.refunds)
    await user.click(await screen.findByRole('button', { name: 'Helpful' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Helpful' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    })
    await user.click(screen.getByRole('button', { name: 'Not helpful' }))
    const dialog = await screen.findByRole('dialog', { name: 'What went wrong?' })
    await user.type(within(dialog).getByLabelText(/A better answer/), 'It is 30 days')
    await user.click(within(dialog).getByRole('button', { name: 'Send feedback' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Not helpful' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    })
    expect(screen.queryByRole('dialog', { name: 'What went wrong?' })).not.toBeInTheDocument()
  })

  it('shows the chat title in the header and renames it from there', async () => {
    const { user } = openChat(SEEDED_CHAT_IDS.refunds)
    await screen.findByRole('article', { name: 'Answer' })
    await user.click(screen.getByRole('button', { name: 'Refund policy for annual plans' }))
    const dialog = await screen.findByRole('dialog', { name: 'Rename chat' })
    expect(within(dialog).getByRole('textbox')).toHaveValue('Refund policy for annual plans')
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Chat options' }))
    expect(await screen.findByRole('menuitem', { name: 'Rename' })).toBeVisible()
  })

  it('keeps the model, the knowledge scope and the files menu in the composer', async () => {
    const { user } = openChat(undefined)
    await screen.findByRole('heading', { name: 'What can I help with today?' })
    expect(screen.getByText('New chat')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Quarterly report summary' }),
    ).not.toBeInTheDocument()
    const message = screen.getByLabelText('Message')
    expect(message.style.maxHeight).toBe('calc(8 * 1.5rem + 1rem)')
    await user.click(screen.getByRole('button', { name: 'Add to message' }))
    const item = await screen.findByRole('menuitem', { name: /Add files or images/ })
    expect(item).toHaveTextContent(/Images up to \d+ MB/)
    await user.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: 'Knowledge scope' })).toHaveTextContent(
      'All knowledge',
    )
    expect(screen.getByRole('button', { name: 'Model' })).toBeVisible()
  })

  it('makes a chat private and shows the lock badge', async () => {
    const { user } = openChat(SEEDED_CHAT_IDS.refunds)
    await screen.findByRole('article', { name: 'Answer' })
    await user.click(screen.getByRole('button', { name: 'Chat options' }))
    await user.click(await screen.findByRole('menuitemcheckbox', { name: /Private chat/ }))
    expect(await screen.findByText('Private')).toBeVisible()
  })

  it('warns before moving a conversation from a local model to a cloud one', async () => {
    const { user } = openChat(SEEDED_CHAT_IDS.refunds)
    await screen.findByRole('article', { name: 'Answer' })
    await user.click(screen.getByRole('button', { name: 'Model' }))
    await user.click(await screen.findByRole('option', { name: /llama3.1:70b/ }))
    await user.click(screen.getByRole('button', { name: 'Model' }))
    await user.click(await screen.findByRole('option', { name: /^GPT-4\.1\b(?! mini)/ }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText(/will be sent to OpenAI/)).toBeVisible()
  })

  it('lets the person pick which knowledge bases to search', async () => {
    const { user } = openChat(undefined)
    await screen.findByRole('heading', { name: 'What can I help with today?' })
    await user.click(screen.getByRole('button', { name: 'Knowledge scope' }))
    const list = await screen.findByRole('list', { name: 'Knowledge bases' })
    // ticking a base selects it without choosing "Selected knowledge" first
    await user.click(await within(list).findByRole('checkbox', { name: /Help center/ }))
    expect(screen.getByRole('radio', { name: /Selected knowledge/ })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Knowledge scope' })).toHaveTextContent(
      '1 knowledge base',
    )
    await user.click(screen.getByRole('radio', { name: /No knowledge/ }))
    expect(screen.getByRole('button', { name: 'Knowledge scope' })).toHaveTextContent(
      'No knowledge',
    )
  })

  it('keeps the draft and disables sending while offline', async () => {
    const { user } = openChat(SEEDED_CHAT_IDS.refunds)
    await screen.findByRole('article', { name: 'Answer' })
    await user.type(screen.getByLabelText('Message'), 'My draft')
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    window.dispatchEvent(new Event('offline'))
    expect(await screen.findByText('Needs a connection')).toBeVisible()
    expect(screen.getByLabelText('Message')).toHaveValue('My draft')
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
  })
})

describe('ChatThread: attachments', () => {
  const upload = (name: string, type: string, size = 1024) => {
    const file = new File(['x'], name, { type })
    Object.defineProperty(file, 'size', { value: size })
    return file
  }

  // the file input's `accept` would drop an unsupported file before the app sees it
  const addFiles = (...files: File[]) => {
    fireEvent.change(screen.getByLabelText('Choose files'), { target: { files } })
  }

  it('uploads a document and lets the person remove it', async () => {
    const { user } = openChat(SEEDED_CHAT_IDS.refunds)
    await screen.findByRole('article', { name: 'Answer' })
    await user.upload(
      screen.getByLabelText('Choose files'),
      upload('report.pdf', 'application/pdf'),
    )
    const files = await screen.findByRole('list', { name: 'Files to send' })
    expect(within(files).getByText('report.pdf')).toBeVisible()
    await waitFor(() => {
      expect(within(files).queryByRole('progressbar')).not.toBeInTheDocument()
    }, STREAM_WAIT)
    await user.click(within(files).getByRole('button', { name: 'Remove report.pdf' }))
    expect(screen.queryByRole('list', { name: 'Files to send' })).not.toBeInTheDocument()
  })

  it('names an unsupported type and a file that is too large, and still sends without them', async () => {
    const bodies = recordBodies()
    const { user } = openChat(SEEDED_CHAT_IDS.refunds)
    await screen.findByRole('article', { name: 'Answer' })
    addFiles(
      upload('archive.zip', 'application/zip'),
      upload('huge.png', 'image/png', 11 * 1024 * 1024),
    )
    expect(await screen.findByText(/isn't a supported type/)).toBeVisible()
    expect(screen.getByText(/is too large\. Images up to 10 MB/)).toBeVisible()
    await user.type(screen.getByLabelText('Message'), 'Just text{Enter}')
    await waitFor(() => {
      expect(bodies).toContainEqual(
        expect.objectContaining({ text: 'Just text', attachmentIds: [] }),
      )
    }, STREAM_WAIT)
  })

  it('shows Retry for an upload that failed', async () => {
    forceScenario('attachment-upload-fails')
    openChat(SEEDED_CHAT_IDS.refunds)
    await screen.findByRole('article', { name: 'Answer' })
    addFiles(upload('notes.txt', 'text/plain'))
    expect(await screen.findByText(/couldn't be uploaded/, {}, STREAM_WAIT)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
  })
})
