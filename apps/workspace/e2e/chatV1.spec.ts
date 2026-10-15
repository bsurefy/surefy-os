// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test'

import { callApi, currentOrgId } from './support/api'
import { addBuilder } from './support/builder'
import { typeMessage } from './support/composer'
import { ORGANIZATION, OWNER, OWNER_STATE, searchServerUrl, stubTitle } from './support/env'
import { waitForHydration } from './support/hydration'
import { connectStubCloudModel, connectStubModel, removeStubModel } from './support/models'
import { startWorker, stopWorker } from './support/worker'

import type { Browser, Page } from '@playwright/test'
import type { ChildProcess } from 'node:child_process'

// Chat V1 on the real API (I6-05): prompts, Compare, web search against the stub SearXNG
// (`searchServer.ts`), voice input with a stubbed browser speech API, a chat with an agent and a
// chat shared with a Builder.
test.describe.configure({ mode: 'serial' })

const CHAT = `/${ORGANIZATION.slug}/chat`
const CHAT_URL = new RegExp(`${CHAT}/[0-9a-f-]{36}$`)

const stamp = String(Date.now())
const AGENT_NAME = `Order desk ${stamp}`
const BUILDER = { name: 'Theo Brandt', email: `chat-builder-${stamp}@e2e.test` }

const answers = (page: Page) => page.getByRole('article', { name: 'Answer' })
const chatList = (page: Page) => page.getByRole('complementary', { name: 'Chats' })
const messageBox = (page: Page) => page.getByRole('textbox', { name: 'Message' })

async function openNewChat(page: Page) {
  await page.goto(CHAT)
  await page.waitForLoadState('networkidle')
}

async function ask(page: Page, question: string) {
  await typeMessage(page, question)
  await page.getByRole('button', { name: 'Send message' }).click()
}

/** Asks in a new chat and waits for the whole answer and the chat's own address. */
async function startChat(page: Page, question: string) {
  await openNewChat(page)
  await ask(page, question)
  await expect(answers(page).last()).toContainText(`Echo: ${question}`)
  await expect(page).toHaveURL(CHAT_URL)
}

/** What the stub search server was asked so far. */
async function searchQueries(): Promise<string[]> {
  const response = await fetch(`${searchServerUrl}/control/queries`)
  return (await response.json()) as string[]
}

async function setSearchMode(mode: 'up' | 'down') {
  const response = await fetch(`${searchServerUrl}/control/mode`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode }),
  })
  expect(response.ok).toBe(true)
}

/** Runs `work` as the signed-in Owner in a page of its own. */
async function asOwner(browser: Browser, work: (page: Page) => Promise<void>) {
  const context = await browser.newContext({ storageState: OWNER_STATE })
  try {
    const page = await context.newPage()
    await page.goto(CHAT)
    await work(page)
  } finally {
    await context.close()
  }
}

let worker: ChildProcess
let localModelKey = ''
let agentId = ''
let builder: Awaited<ReturnType<typeof addBuilder>> | undefined
/** The address of the chat the Owner shared with the Builder. */
let sharedChatUrl = ''

test.beforeAll(async ({ browser }) => {
  worker = await startWorker()
  await asOwner(browser, async (page) => {
    localModelKey = await connectStubModel(page)
    await connectStubCloudModel(page)
  })
})

test.afterAll(async ({ browser }) => {
  await builder?.context.close()
  await asOwner(browser, async (page) => {
    const orgId = await currentOrgId(page)
    if (agentId !== '') {
      const confirm = `confirmName=${encodeURIComponent(AGENT_NAME)}&reason=cleanup`
      await callApi(page, 'DELETE', `/orgs/${orgId}/agents/${agentId}?${confirm}`)
    }
    const providers = await callApi<{ providers: { id: string; status: string }[] }>(
      page,
      'GET',
      `/orgs/${orgId}/vault/search-providers`,
    )
    for (const provider of providers.providers.filter((entry) => entry.status !== 'revoked')) {
      await callApi(page, 'POST', `/orgs/${orgId}/vault/credentials/${provider.id}/revoke`)
    }
    await removeStubModel(page)
  })
  stopWorker(worker)
})

test.describe('Prompts', () => {
  test('saves a prompt with variables and uses it in the message box', async ({ page }) => {
    await openNewChat(page)
    await page.getByRole('button', { name: 'Prompt library' }).click()
    const library = page.getByRole('dialog', { name: 'Prompt library' })
    await expect(library.getByText('No prompts yet')).toBeVisible()

    await library.getByRole('button', { name: 'New prompt' }).first().click()
    const form = page.getByRole('dialog', { name: 'New prompt' })
    await form.getByLabel('Title').fill('Reply to a customer')
    await form
      .getByLabel('Prompt', { exact: true })
      .fill('Write a reply to {customer} about {issue}.')
    await expect(form.getByText('{customer}', { exact: true })).toBeVisible()
    await form.getByRole('button', { name: 'Create prompt' }).click()
    await expect(page.getByText('Prompt created')).toBeVisible()

    await library.getByRole('button', { name: 'Use prompt Reply to a customer' }).click()
    const fill = page.getByRole('dialog', { name: 'Use “Reply to a customer”' })
    await fill.getByLabel('customer').fill('Dana')
    await fill.getByLabel('issue').fill('a late parcel')
    await fill.getByRole('button', { name: 'Use prompt' }).click()

    await expect(messageBox(page)).toHaveValue('Write a reply to Dana about a late parcel.')
    await page.getByRole('button', { name: 'Send message' }).click()
    await expect(answers(page).last()).toContainText(
      'Echo: Write a reply to Dana about a late parcel.',
    )
  })

  test('shares a prompt with the whole organization and deletes the personal one', async ({
    page,
  }) => {
    await openNewChat(page)
    await page.getByRole('button', { name: 'Prompt library' }).click()
    const library = page.getByRole('dialog', { name: 'Prompt library' })
    await library.getByRole('button', { name: 'New prompt' }).first().click()
    const form = page.getByRole('dialog', { name: 'New prompt' })
    await form.getByLabel('Title').fill('Team greeting')
    await form.getByLabel('Prompt', { exact: true }).fill('Greet {customer} warmly.')
    await form.getByRole('radio', { name: /Shared/ }).click()
    await form.getByRole('button', { name: 'Create prompt' }).click()
    await expect(page.getByText('Prompt created')).toBeVisible()
    await expect(library.getByText('Everyone in the organization')).toBeVisible()

    await library.getByRole('button', { name: 'Actions for Reply to a customer' }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await expect(page.getByText('Prompt deleted · Undo')).toBeVisible()
    await expect(
      library.getByRole('button', { name: 'Use prompt Reply to a customer' }),
    ).toBeHidden()
  })
})

test.describe('Compare', () => {
  test('answers with two models side by side and continues with one', async ({ page }) => {
    await openNewChat(page)
    await page.getByRole('button', { name: 'Compare models' }).click()
    await page.getByRole('option').first().click()
    await expect(page.getByRole('button', { name: 'Compare models' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    const question = 'Which carrier is faster for Lisbon?'
    await ask(page, question)
    const comparison = page.getByRole('group', { name: 'Comparison of two answers' })
    await expect(comparison).toBeVisible()
    const columnA = comparison.getByRole('region', { name: 'Answer A' })
    const columnB = comparison.getByRole('region', { name: 'Answer B' })
    await expect(columnA).toContainText(`Echo: ${question}`)
    await expect(columnB).toContainText(`Echo: ${question}`)
    await expect(columnA).toContainText(/ s · \d+ in \/ \d+ out/)

    await columnB.getByRole('button', { name: 'Continue with B' }).click()
    await expect(comparison).toBeHidden()
    await expect(answers(page)).toHaveCount(1)
    await expect(answers(page)).toContainText(`Echo: ${question}`)

    await page.reload()
    await expect(page.getByRole('group', { name: 'Comparison of two answers' })).toBeHidden()
    await expect(answers(page)).toHaveCount(1)
  })
})

test.describe('Web search', () => {
  test('is refused until a search provider is set up', async ({ page }) => {
    await openNewChat(page)
    const toggle = page.getByRole('button', { name: 'Search the web' })
    await expect(toggle).toBeVisible()
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await ask(page, 'What is the weather in Lisbon?')
    await expect(page.getByText("Web search isn't available right now.")).toBeVisible()
    expect(await searchQueries()).toEqual([])
  })

  test('adds the stub SearXNG as the search provider in the Vault', async ({ page }) => {
    await page.goto(`/${ORGANIZATION.slug}/settings/vault`)
    await expect(page.getByText("Web search isn't set up")).toBeVisible()
    await page.getByRole('button', { name: 'Add search provider' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add search provider' })
    await dialog.getByRole('combobox', { name: 'Provider' }).click()
    await page.getByRole('option', { name: 'SearXNG' }).click()
    await dialog.getByLabel('Name').fill('E2E SearXNG')
    await dialog.getByLabel('SearXNG address').fill(searchServerUrl)
    // saving needs a connection test that passed
    await dialog.getByRole('button', { name: 'Test connection' }).click()
    await expect(dialog.getByText('Connection works')).toBeVisible()
    await dialog.getByRole('button', { name: 'Save provider' }).click()
    await expect(page.getByText('E2E SearXNG was added')).toBeVisible()

    const table = page.getByRole('table', { name: 'Search providers' })
    await expect(table.getByRole('row').filter({ hasText: 'E2E SearXNG' })).toContainText('Primary')
    await expect(page.getByText('Web search uses E2E SearXNG.')).toBeVisible()
  })

  test('answers with sources from the web and shows the search step', async ({ page }) => {
    await openNewChat(page)
    await page.getByRole('button', { name: 'Search the web' }).click()
    const question = 'What is the weather in Lisbon?'
    await ask(page, question)
    await expect(answers(page).last()).toContainText(`Echo: ${question}`)
    await expect(page).toHaveURL(CHAT_URL)

    const answer = answers(page).last()
    await expect(answer).toContainText('Searched the web · done')
    await expect(answer).toContainText('Sources from the web')
    await expect(answer.getByText('Stub result 1')).toBeVisible()
    await expect(answer.getByText('Stub result 3')).toBeVisible()
    expect(await searchQueries()).toContain(question)

    await page.reload()
    await expect(answers(page).last()).toContainText('Sources from the web')
  })

  test('answers without it, and says so, when the provider fails', async ({ page }) => {
    await setSearchMode('down')
    try {
      await openNewChat(page)
      await page.getByRole('button', { name: 'Search the web' }).click()
      const question = 'Who won the match yesterday?'
      await ask(page, question)
      await expect(answers(page).last()).toContainText(`Echo: ${question}`)
      await expect(page.getByText("Web search didn't work · answered without it")).toBeVisible()
    } finally {
      await setSearchMode('up')
    }
  })
})

test.describe('Voice input', () => {
  test('dictates into the message box, editable before sending', async ({ page }) => {
    // A real microphone is not available in CI: the page gets a speech recognition it controls.
    await page.addInitScript(() => {
      class FakeRecognition {
        lang = ''
        continuous = false
        interimResults = false
        onresult: ((event: unknown) => void) | null = null
        onerror: ((event: { error: string }) => void) | null = null
        onend: (() => void) | null = null
        start() {
          ;(window as unknown as { __speech: FakeRecognition }).__speech = this
        }
        stop() {
          this.onend?.()
        }
        abort() {
          this.onend?.()
        }
      }
      Object.assign(window, { SpeechRecognition: FakeRecognition })
    })
    const hear = (transcripts: string[]) =>
      page.evaluate((heard) => {
        const speech = (
          window as unknown as {
            __speech: { onresult: (event: unknown) => void }
          }
        ).__speech
        speech.onresult({
          resultIndex: 0,
          results: heard.map((transcript) => ({ isFinal: false, 0: { transcript } })),
        })
      }, transcripts)

    await openNewChat(page)
    await waitForHydration(page, 'textarea[aria-label="Message"]')
    await page.getByRole('button', { name: 'Start dictating' }).click()
    await expect(
      page.getByText('Your browser may send audio to its own speech service'),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Continue' }).click()
    const stop = page.getByRole('button', { name: 'Stop dictating' })
    await expect(stop).toHaveAttribute('aria-pressed', 'true')

    await hear(['what is the'])
    await expect(messageBox(page)).toHaveValue('what is the')
    await hear(['what is the', 'refund window'])
    await expect(messageBox(page)).toHaveValue('what is the refund window')
    await stop.click()
    await expect(page.getByRole('button', { name: 'Start dictating' })).toBeVisible()

    await messageBox(page).fill('what is the refund window for annual plans')
    await page.getByRole('button', { name: 'Send message' }).click()
    await expect(answers(page).last()).toContainText(
      'Echo: what is the refund window for annual plans',
    )
  })

  test('says so when the microphone is blocked', async ({ page }) => {
    await page.addInitScript(() => {
      class FakeRecognition {
        onerror: ((event: { error: string }) => void) | null = null
        onend: (() => void) | null = null
        start() {
          this.onerror?.({ error: 'not-allowed' })
          this.onend?.()
        }
        stop() {
          this.onend?.()
        }
        abort() {
          this.onend?.()
        }
      }
      Object.assign(window, { SpeechRecognition: FakeRecognition })
    })
    await openNewChat(page)
    await waitForHydration(page, 'textarea[aria-label="Message"]')
    // the notice was acknowledged by the previous test's browser context only
    await page.getByRole('button', { name: 'Start dictating' }).click()
    const continueButton = page.getByRole('button', { name: 'Continue' })
    if (await continueButton.isVisible()) await continueButton.click()
    await expect(
      page.getByRole('alert').filter({ hasText: 'The microphone is blocked' }),
    ).toBeVisible()
  })
})

test.describe('Agents in Chat', () => {
  test('starts a chat with an agent shared with the person', async ({ page }) => {
    await page.goto(CHAT)
    const orgId = await currentOrgId(page)
    const agent = await callApi<{ id: string }>(page, 'POST', `/orgs/${orgId}/agents`, {
      name: AGENT_NAME,
      modelKey: localModelKey,
    })
    agentId = agent.id
    const draftPath = `/orgs/${orgId}/agents/${agentId}/draft`
    const draft = await callApi<{ revision: number; definition: Record<string, unknown> }>(
      page,
      'GET',
      draftPath,
    )
    await callApi(page, 'PUT', draftPath, {
      baseRevision: draft.revision,
      definition: { ...draft.definition, instructions: 'Answer questions about orders.' },
    })
    const current = await callApi<{ revision: number }>(page, 'GET', draftPath)
    await callApi(page, 'POST', `/orgs/${orgId}/agents/${agentId}/publish`, {
      baseRevision: current.revision,
    })

    await openNewChat(page)
    const section = chatList(page).getByRole('region', { name: 'Agents shared with you' })
    await section.getByRole('link', { name: AGENT_NAME }).click()
    await expect(page).toHaveURL(new RegExp(`agent=${agentId}`))
    await expect(page.getByRole('button', { name: 'Model or agent' })).toContainText(AGENT_NAME)

    await ask(page, 'Where is order 2044?')
    await expect(answers(page).last()).toContainText('Echo: Where is order 2044?')
    await expect(page).toHaveURL(CHAT_URL)

    // an agent chat keeps its agent for good
    await page.reload()
    await expect(page.getByTitle(`This chat talks to ${AGENT_NAME}`)).toBeVisible()
    await expect(answers(page)).toHaveCount(1)
    await expect(chatList(page).getByRole('link', { name: 'Where is order 2044' })).toBeVisible()
  })
})

test.describe('Shared chats', () => {
  const QUESTION = 'Summarize the shipping rules for Lisbon'

  test('shares a chat with a Builder, who reads it view only', async ({ browser, page }) => {
    await page.goto(CHAT)
    builder = await addBuilder(browser, page, BUILDER)
    await startChat(page, QUESTION)
    const title = stubTitle(QUESTION)

    await chatList(page)
      .getByRole('button', { name: `Actions for ${title}` })
      .click()
    await page.getByRole('menuitem', { name: 'Share' }).click()
    const dialog = page.getByRole('dialog', { name: `Share “${title}”` })
    await expect(dialog.getByText('Not shared yet')).toBeVisible()
    await dialog.getByRole('combobox', { name: 'People and teams' }).click()
    await page.getByPlaceholder('Search people and teams').fill(BUILDER.name)
    await page.getByRole('option', { name: new RegExp(BUILDER.name) }).click()
    await page.keyboard.press('Escape')
    await dialog.getByRole('button', { name: 'Share', exact: true }).click()
    await expect(page.getByText('Shared with 1 person or team')).toBeVisible()
    await expect(dialog.getByText('1 person has access')).toBeVisible()
    await dialog.getByRole('button', { name: 'Close' }).first().click()

    const theirs = builder.page
    await theirs.goto(CHAT)
    const shared = chatList(theirs).getByRole('region', { name: 'Shared with me' })
    await expect(shared).toContainText(`From ${OWNER.name}`)
    await shared.getByRole('link', { name: title }).click()
    await expect(theirs.getByText(`Shared by ${OWNER.name} · view only`)).toBeVisible()
    await expect(answers(theirs)).toContainText(`Echo: ${QUESTION}`)
    await expect(messageBox(theirs)).toHaveCount(0)
    sharedChatUrl = theirs.url()
  })

  test('shows the shared prompt to the Builder and stops sharing', async ({ page }) => {
    if (!builder) throw new Error('The Builder was not added')
    const theirs = builder.page
    await theirs.goto(CHAT)
    await theirs.waitForLoadState('networkidle')
    await theirs.getByRole('button', { name: 'Prompt library' }).click()
    const library = theirs.getByRole('dialog', { name: 'Prompt library' })
    await expect(library.getByRole('button', { name: 'Use prompt Team greeting' })).toBeVisible()
    await expect(
      library.getByRole('button', { name: 'Use prompt Reply to a customer' }),
    ).toBeHidden()
    await theirs.keyboard.press('Escape')

    const title = stubTitle(QUESTION)
    await page.goto(CHAT)
    await page.waitForLoadState('networkidle')
    await chatList(page)
      .getByRole('button', { name: `Actions for ${title}` })
      .click()
    await page.getByRole('menuitem', { name: 'Share' }).click()
    const dialog = page.getByRole('dialog', { name: `Share “${title}”` })
    await dialog.getByRole('button', { name: `Stop sharing with ${BUILDER.name}` }).click()
    await expect(dialog.getByText('Not shared yet')).toBeVisible()

    await theirs.goto(sharedChatUrl)
    await expect(theirs.getByText("This chat isn't available")).toBeVisible()
  })
})
