// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test'

import { typeMessage } from './support/composer'
import { LONG_ANSWER_PREFIX, ORGANIZATION, stubTitle } from './support/env'
import { connectStubModel } from './support/models'

import type { Page } from '@playwright/test'

const CHAT = `/${ORGANIZATION.slug}/chat`
const CHAT_URL = new RegExp(`${CHAT}/[0-9a-f-]{36}$`)

const answers = (page: Page) => page.getByRole('article', { name: 'Answer' })
const chatList = (page: Page) => page.getByRole('complementary', { name: 'Chats' })

/** Opens a new chat, ready to type in (`next dev` compiles the page on its first visit). */
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

// The first spec runs before any model exists; the second connects the stub model for the rest.
test.describe.configure({ mode: 'serial' })

test.describe('Chat', () => {
  test('is in the navigation and asks for a model before the first chat', async ({ page }) => {
    await page.goto(`/${ORGANIZATION.slug}/profile`)
    await page.getByRole('navigation').getByRole('link', { name: /Chat/ }).click()
    await expect(page).toHaveURL(CHAT)

    await expect(page.getByText('Connect a model to start chatting')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open Vault' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Finish setting up' })).toBeVisible()
  })

  test('streams an answer from a local model and keeps the chat', async ({ page }) => {
    await page.goto(CHAT)
    await connectStubModel(page)
    const question = 'What is the refund window for annual plans?'
    await startChat(page, question)

    await expect(answers(page)).toContainText('Stays on your server')
    await expect(chatList(page).getByRole('link', { name: stubTitle(question) })).toBeVisible()

    await page.reload()
    await expect(page.getByRole('article', { name: 'Your message' })).toContainText(question)
    await expect(answers(page)).toHaveCount(1)
    await expect(answers(page)).toContainText(`Echo: ${question}`)
  })

  test('stops an answer while it streams', async ({ page }) => {
    await openNewChat(page)
    await ask(page, `${LONG_ANSWER_PREFIX} about a lighthouse`)
    await expect(answers(page).last()).toContainText('word5')
    await page.getByRole('button', { name: 'Stop answering' }).click()

    await expect(answers(page).last()).toContainText('Stopped')
    await expect(answers(page).last()).not.toContainText('word399')
    await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible()
  })

  test('regenerates the last answer', async ({ page }) => {
    const question = 'Which regions do we ship to?'
    await startChat(page, question)

    await page.getByRole('button', { name: 'Regenerate answer' }).click()
    await expect(answers(page)).toHaveCount(1)
    await expect(answers(page)).toContainText(`Echo: ${question}`)
    await page.reload()
    await expect(answers(page)).toHaveCount(1)
  })

  test('edits the last question and answers it again', async ({ page }) => {
    await startChat(page, 'Can I get a refund after 10 days?')

    await page.getByRole('button', { name: 'Edit' }).click()
    const box = page.getByLabel('Edit your message')
    await box.fill('Can I get a refund after 20 days?')
    await page.getByRole('button', { name: 'Save and resend' }).click()

    await expect(answers(page).last()).toContainText('Echo: Can I get a refund after 20 days?')
    await page.reload()
    await expect(page.getByRole('article', { name: 'Your message' })).toContainText(
      'Can I get a refund after 20 days?',
    )
    await expect(answers(page)).toHaveCount(1)
  })

  test('renames, deletes and restores a chat from the list', async ({ page }) => {
    const question = 'Summarize the onboarding checklist for engineers'
    await startChat(page, question)
    const list = chatList(page)
    const title = stubTitle(question)
    await expect(list.getByRole('link', { name: title })).toBeVisible()

    await list.getByRole('button', { name: `Actions for ${title}` }).click()
    await page.getByRole('menuitem', { name: 'Rename' }).click()
    const rename = page.getByRole('dialog', { name: 'Rename chat' })
    await rename.getByLabel('Title').fill('Engineer onboarding')
    await rename.getByRole('button', { name: 'Save' }).click()
    await expect(list.getByRole('link', { name: 'Engineer onboarding' })).toBeVisible()

    await list.getByRole('button', { name: 'Actions for Engineer onboarding' }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await expect(page.getByText('Chat deleted')).toBeVisible()
    await expect(list.getByRole('link', { name: 'Engineer onboarding' })).toBeHidden()

    await list.getByRole('button', { name: 'Recently deleted' }).click()
    await expect(list.getByText('Engineer onboarding')).toBeVisible()
    await list.getByRole('button', { name: 'Restore Engineer onboarding' }).click()
    await expect(page.getByText('Chat restored')).toBeVisible()
    await list.getByRole('button', { name: 'Back to chats' }).click()
    await expect(list.getByRole('link', { name: 'Engineer onboarding' })).toBeVisible()
  })
})
