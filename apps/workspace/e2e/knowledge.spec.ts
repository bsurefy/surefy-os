// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test'

import { typeMessage } from './support/composer'
import { EMBED_MODEL_ID, ORGANIZATION } from './support/env'
import { connectStubEmbedding, connectStubModel } from './support/models'
import { startWorker, stopWorker } from './support/worker'

import type { Page } from '@playwright/test'
import type { ChildProcess } from 'node:child_process'

const KNOWLEDGE = `/${ORGANIZATION.slug}/knowledge`
const BASE = `Handbook ${String(Date.now())}`
const FILE = 'refund-policy.md'
const CONTENT = [
  '# Refund policy',
  '',
  'Customers can return items within 14 days of delivery for a full refund.',
  '',
  '# Shipping',
  '',
  'Orders ship from the Berlin warehouse within 2 business days.',
  '',
].join('\n')
const QUESTION = 'How many days do customers have to return items?'

// One knowledge base is created, filled and asked about across the specs, in order. The worker
// ingests the document; the other specs run without one.
test.describe.configure({ mode: 'serial' })

let worker: ChildProcess
test.beforeAll(async () => {
  worker = await startWorker()
})
test.afterAll(() => {
  stopWorker(worker)
})

const sources = (page: Page) => page.getByRole('table', { name: 'Sources' })

async function openBase(page: Page) {
  await page.goto(KNOWLEDGE)
  await page.getByRole('link', { name: BASE }).click()
  await expect(page.getByRole('heading', { name: BASE })).toBeVisible()
}

test.describe('Knowledge', () => {
  test('creates a knowledge base, and asks for an embedding model before documents', async ({
    page,
  }) => {
    await page.goto(KNOWLEDGE)
    await expect(
      page.getByRole('heading', { name: 'Create your first knowledge base' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'New knowledge base' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'New knowledge base' })
    await dialog.getByRole('textbox', { name: 'Name' }).fill(BASE)
    await dialog.getByRole('button', { name: 'Create knowledge base' }).click()

    await expect(page.getByRole('heading', { name: BASE })).toBeVisible()
    await expect(page.getByText('Choose an embedding model before adding documents')).toBeVisible()
  })

  test('takes a document, and has it ready once the worker has read it', async ({ page }) => {
    await page.goto(KNOWLEDGE)
    await connectStubEmbedding(page)
    await openBase(page)

    // a base made before the organization had an embedding model has none of its own
    await page.getByRole('link', { name: 'Settings' }).last().click()
    await page.getByRole('combobox', { name: 'Embedding model' }).click()
    await page.getByRole('option', { name: new RegExp(EMBED_MODEL_ID) }).click()
    await page.getByRole('link', { name: 'Sources' }).last().click()

    await page.locator('input[type="file"]').setInputFiles({
      name: FILE,
      mimeType: 'text/markdown',
      buffer: Buffer.from(CONTENT),
    })
    const row = sources(page).getByRole('row').filter({ hasText: FILE })
    await expect(row).toBeVisible()
    await expect(row).toContainText('Ready', { timeout: 90_000 })
    await expect(row).toContainText('File')
  })

  test('finds the passage in a test search', async ({ page }) => {
    await openBase(page)
    await page.getByRole('link', { name: 'Test search' }).click()
    await page.getByRole('textbox', { name: 'Question' }).fill(QUESTION)
    await page.getByRole('button', { name: 'Search', exact: true }).click()

    const results = page.getByRole('region', { name: 'Search results' })
    await expect(results).toContainText(/[1-9] passages? found/)
    await expect(results).toContainText('Customers can return items within 14 days')
    await expect(results).toContainText(`From ${FILE}`)
  })

  test('answers in chat with the source it used', async ({ page }) => {
    await page.goto(KNOWLEDGE)
    await connectStubModel(page)
    await page.goto(`/${ORGANIZATION.slug}/chat`)
    await page.waitForLoadState('networkidle')
    await typeMessage(page, QUESTION)
    await page.getByRole('button', { name: 'Send message' }).click()

    const answer = page.getByRole('article', { name: 'Answer' }).last()
    await expect(answer).toContainText(`Echo: ${QUESTION}`)
    // the passage the answer used is a numbered source, opened beside the answer
    await answer.getByRole('button', { name: /^Source 1:/ }).click()
    const preview = page.getByRole('dialog')
    await expect(preview).toContainText('Customers can return items within 14 days')
    await expect(preview.getByRole('link', { name: 'Open in Knowledge' })).toBeVisible()
  })
})
