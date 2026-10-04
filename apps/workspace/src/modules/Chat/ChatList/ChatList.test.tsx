// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import ChatList from './ChatList'
import ChatListSheet from './ChatListSheet'
import { chatDomain, resetChatMock, SEEDED_CHAT_IDS } from '../../../../mock/handlers/chat'
import { dataControlDomain, resetDataControlMock } from '../../../../mock/handlers/dataControl'

const mockPush = vi.fn()
let mockChatId: string | undefined

vi.mock('next/navigation', () => ({
  useParams: () => ({ orgSlug: 'acme', chatId: mockChatId }),
  usePathname: () => '/acme/chat',
  useRouter: () => ({ push: mockPush }),
}))

const server = setupTestServer(...chatDomain.handlers, ...dataControlDomain.handlers)

function renderList() {
  return renderWithProviders(<ChatList />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs('user')),
  })
}

/** Forces a scenario on every mocked request of this test. */
function useScenario(scenario: string) {
  server.events.on('request:start', ({ request }) => {
    request.headers.set('x-mock-scenario', scenario)
  })
}

/** The Undo button of the toast with this text; toasts of earlier tests may still be on screen. */
function undoButton(message: string) {
  const toast = screen.getByText(message).closest('li')
  if (!toast) throw new Error(`No toast says "${message}"`)
  return within(toast).getByRole('button', { name: 'Undo' })
}

/** Opens the "Move to folder" submenu with the keyboard; pointer moves close it in jsdom. */
async function openMoveMenu(user: ReturnType<typeof renderList>['user']) {
  const trigger = await screen.findByRole('menuitem', { name: 'Move to folder' })
  trigger.focus()
  await user.keyboard('{ArrowRight}')
}

/** The "⋯" button of a row is named after its chat; it is hidden until hover, not removed. */
const rowMenu = (title: string) => screen.findByRole('button', { name: `Actions for ${title}` })

beforeEach(() => {
  // Only the clock: timers and network stay real. 15:00 keeps "4 hours ago" on the same day.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 5, 15, 0))
  mockChatId = undefined
  mockPush.mockClear()
  resetChatMock()
  resetDataControlMock()
})

afterEach(() => {
  vi.useRealTimers()
  server.events.removeAllListeners()
})

describe('ChatList', () => {
  it('shows Pinned, Folders and the chats grouped by date', async () => {
    renderList()
    const pinned = await screen.findByRole('region', { name: 'Pinned' })
    expect(within(pinned).getByText('Quarterly report summary')).toBeVisible()

    const folders = screen.getByRole('region', { name: 'Folders' })
    expect(within(folders).getByRole('button', { name: /^Support/ })).toHaveTextContent('2')
    expect(within(folders).getByRole('button', { name: /^Personal/ })).toHaveTextContent('1')

    const today = screen.getByRole('region', { name: 'Today' })
    expect(within(today).getByText('Onboarding checklist')).toBeVisible()
    expect(
      within(screen.getByRole('region', { name: 'Yesterday' })).getByText('Weekly sync notes'),
    ).toBeVisible()
    expect(
      within(screen.getByRole('region', { name: 'Previous 7 days' })).getByText(
        'Pricing page copy',
      ),
    ).toBeVisible()
    expect(
      within(screen.getByRole('region', { name: 'Previous 30 days' })).getByText(
        'SQL window functions',
      ),
    ).toBeVisible()
    // chats in a folder and deleted chats stay out of the date groups
    expect(screen.queryByText('Old brainstorm')).not.toBeInTheDocument()
    expect(within(today).queryByText('Refund policy for annual plans')).not.toBeInTheDocument()
  })

  it('opens the list as a slide-over panel on small screens', async () => {
    const { user } = renderWithProviders(<ChatListSheet />, {
      orgId: ORG_ID,
      messages: appMessages,
      queryClient: seededShellClient(accessAs('user')),
    })
    await user.click(screen.getByRole('button', { name: 'Chats' }))
    const panel = await screen.findByRole('dialog', { name: 'Chats' })
    expect(await within(panel).findByText('Onboarding checklist')).toBeVisible()
    expect(within(panel).getByRole('link', { name: 'New chat' })).toBeVisible()
  })

  it('links each chat to its thread and marks the open one', async () => {
    mockChatId = SEEDED_CHAT_IDS.onboarding
    renderList()
    const open = await screen.findByRole('link', { name: 'Onboarding checklist' })
    expect(open).toHaveAttribute('href', `/acme/chat/${SEEDED_CHAT_IDS.onboarding}`)
    expect(open).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Weekly sync notes' })).not.toHaveAttribute(
      'aria-current',
    )
    expect(screen.getByRole('link', { name: 'New chat' })).toHaveAttribute('href', '/acme/chat')
  })

  it('opens a folder to show its chats', async () => {
    const { user } = renderList()
    const support = await screen.findByRole('button', { name: /^Support/ })
    expect(support).toHaveAttribute('aria-expanded', 'false')
    await user.click(support)
    expect(support).toHaveAttribute('aria-expanded', 'true')
    expect(await screen.findByText('Refund policy for annual plans')).toBeVisible()
    expect(screen.getByText('Reply to the Acme escalation')).toBeVisible()
  })

  it('searches titles and message text and shows the text that matched', async () => {
    const { user } = renderList()
    await user.type(await screen.findByRole('searchbox', { name: 'Search chats' }), 'calm reply')
    const results = await screen.findByRole('region', { name: 'Results' })
    expect(within(results).getByText('Reply to the Acme escalation')).toBeVisible()
    expect(within(results).getByText(/Draft a calm reply/)).toBeVisible()
    expect(screen.queryByRole('region', { name: 'Folders' })).not.toBeInTheDocument()

    await user.clear(screen.getByRole('searchbox', { name: 'Search chats' }))
    await user.type(screen.getByRole('searchbox', { name: 'Search chats' }), 'no such thing')
    expect(await screen.findByText('No chats found')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(await screen.findByRole('region', { name: 'Pinned' })).toBeVisible()
  })

  it('pins and unpins a chat from its menu', async () => {
    const { user } = renderList()
    await user.click(await rowMenu('Onboarding checklist'))
    await user.click(await screen.findByRole('menuitem', { name: 'Pin' }))
    const pinned = await screen.findByRole('region', { name: 'Pinned' })
    await waitFor(() => {
      expect(within(pinned).getByText('Onboarding checklist')).toBeVisible()
    })
    expect(screen.queryByRole('region', { name: 'Today' })).not.toBeInTheDocument()

    await user.click(
      await within(pinned).findByRole('button', { name: 'Actions for Onboarding checklist' }),
    )
    await user.click(await screen.findByRole('menuitem', { name: 'Unpin' }))
    expect(await screen.findByRole('region', { name: 'Today' })).toBeVisible()
  })

  it('renames a chat', async () => {
    const { user } = renderList()
    await user.click(await rowMenu('SQL window functions'))
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }))
    const dialog = await screen.findByRole('dialog', { name: 'Rename chat' })
    const title = within(dialog).getByLabelText('Title')
    expect(title).toHaveValue('SQL window functions')
    await user.clear(title)
    await user.type(title, 'Window functions cheat sheet')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Window functions cheat sheet')).toBeVisible()
    expect(screen.queryByText('SQL window functions')).not.toBeInTheDocument()
  })

  it('moves a chat to a folder and back out', async () => {
    const { user } = renderList()
    await user.click(await rowMenu('Pricing page copy'))
    await openMoveMenu(user)
    await user.click(await screen.findByRole('menuitem', { name: 'Personal' }))
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Previous 7 days' })).not.toBeInTheDocument()
    })
    expect(await screen.findByRole('button', { name: /^Personal/ })).toHaveTextContent('2')
    await user.click(screen.getByRole('button', { name: /^Personal/ }))
    await user.click(await screen.findByRole('button', { name: 'Actions for Pricing page copy' }))
    await openMoveMenu(user)
    await user.click(await screen.findByRole('menuitem', { name: 'No folder' }))
    expect(await screen.findByRole('region', { name: 'Previous 7 days' })).toBeVisible()
  })

  it('deletes a chat with an Undo that brings it back', async () => {
    const { user } = renderList()
    await user.click(await rowMenu('Onboarding checklist'))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    expect(await screen.findByText('Chat deleted')).toBeVisible()
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Onboarding checklist' })).not.toBeInTheDocument()
    })

    await user.click(undoButton('Chat deleted'))
    expect(await screen.findByRole('link', { name: 'Onboarding checklist' })).toBeVisible()
  })

  it('leaves the thread when its chat is deleted', async () => {
    mockChatId = SEEDED_CHAT_IDS.onboarding
    const { user } = renderList()
    await user.click(await rowMenu('Onboarding checklist'))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/acme/chat')
    })
  })

  it('lists Recently deleted with the days left and restores a chat', async () => {
    const { user } = renderList()
    await user.click(await screen.findByRole('button', { name: 'Recently deleted' }))
    const section = await screen.findByRole('region', { name: 'Recently deleted' })
    expect(await within(section).findByText('Old brainstorm')).toBeVisible()
    expect(within(section).getByText('Deleted Oct 2 · 27 days left')).toBeVisible()

    await user.click(within(section).getByRole('button', { name: 'Restore Old brainstorm' }))
    expect(await screen.findByText('Nothing deleted in the last 30 days')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Back to chats' }))
    expect(await screen.findByRole('link', { name: 'Old brainstorm' })).toBeVisible()
  })

  it('creates a folder and refuses a name that is taken', async () => {
    const { user } = renderList()
    await user.click(await screen.findByRole('button', { name: 'New folder' }))
    const dialog = await screen.findByRole('dialog', { name: 'New folder' })
    await user.type(within(dialog).getByLabelText('Name'), 'support')
    await user.click(within(dialog).getByRole('button', { name: 'Create folder' }))
    expect(
      await within(dialog).findByText('You already have a folder with this name.'),
    ).toBeVisible()
    await user.clear(within(dialog).getByLabelText('Name'))
    await user.type(within(dialog).getByLabelText('Name'), 'Projects')
    await user.click(within(dialog).getByRole('button', { name: 'Create folder' }))
    expect(await screen.findByRole('button', { name: /^Projects/ })).toBeVisible()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renames a folder', async () => {
    const { user } = renderList()
    await user.click(await screen.findByRole('button', { name: 'Actions for folder Personal' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }))
    const dialog = await screen.findByRole('dialog', { name: 'Rename folder' })
    await user.clear(within(dialog).getByLabelText('Name'))
    await user.type(within(dialog).getByLabelText('Name'), 'Home')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('button', { name: /^Home/ })).toBeVisible()
  })

  it('hides a deleted folder at once and keeps it when Undo is pressed', async () => {
    const { user } = renderList()
    await user.click(await screen.findByRole('button', { name: 'Actions for folder Personal' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete folder' }))
    expect(await screen.findByText('Folder “Personal” deleted')).toBeVisible()
    expect(screen.queryByRole('button', { name: /^Personal/ })).not.toBeInTheDocument()

    await user.click(undoButton('Folder “Personal” deleted'))
    expect(await screen.findByRole('button', { name: /^Personal/ })).toHaveTextContent('1')
  })

  it('sends the folder delete only when the Undo toast closes', async () => {
    const deletes: string[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'DELETE') deletes.push(new URL(request.url).pathname)
    })
    const { user } = renderList()
    await user.click(await screen.findByRole('button', { name: 'Actions for folder Personal' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete folder' }))
    expect(deletes).toHaveLength(0)
    await waitFor(
      () => {
        expect(deletes).toHaveLength(1)
      },
      { timeout: 9000 },
    )
    expect(deletes[0]).toMatch(/\/chat-folders\//)
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /^Personal/ })).not.toBeInTheDocument()
    })
  }, 15_000)

  it('starts an export of a chat and follows it to Ready', async () => {
    const { user } = renderList()
    await user.click(await rowMenu('Onboarding checklist'))
    await user.click(await screen.findByRole('menuitem', { name: 'Export' }))
    const dialog = await screen.findByRole('dialog', { name: 'Export chat' })
    await user.click(within(dialog).getByRole('radio', { name: 'Markdown' }))
    await user.click(within(dialog).getByRole('button', { name: 'Start export' }))
    expect(
      await within(dialog).findByText('Your export is ready.', undefined, { timeout: 8000 }),
    ).toBeVisible()
    expect(within(dialog).getByRole('button', { name: 'Download' })).toBeVisible()
  }, 15_000)

  it('shows the empty state when there are no chats', async () => {
    useScenario('empty')
    renderList()
    expect(await screen.findByText('No chats yet')).toBeVisible()
  })

  it('shows an error with Retry when the list does not load', async () => {
    useScenario('error')
    renderList()
    expect(await screen.findByRole('button', { name: /Try again|Retry/ })).toBeVisible()
  })
})
