// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test'

import { arrangeRefundAgent, cleanUp, readRun, refundsSoFar, startTestRun } from './support/agents'
import { ORGANIZATION } from './support/env'
import { connectStubModel } from './support/models'
import { startWorker, stopWorker } from './support/worker'

import type { RefundAgent } from './support/agents'
import type { Page } from '@playwright/test'
import type { ChildProcess } from 'node:child_process'

const stamp = String(Date.now())
const GUARD = `/${ORGANIZATION.slug}/guard`
const RULE = `No refunds ${stamp}`

let worker: ChildProcess
let agent: RefundAgent

test.beforeAll(async () => {
  worker = await startWorker()
})
test.afterAll(async ({ browser }) => {
  stopWorker(worker)
  await cleanUp(browser, agent)
})

const table = (page: Page) => page.getByRole('table', { name: 'Guardrails' })
const rowOf = (page: Page, name: string) => table(page).getByRole('row').filter({ hasText: name })

async function runRefund(page: Page, text: string): Promise<string> {
  const runId = await startTestRun(page, agent, text)
  await expect.poll(async () => (await readRun(page, agent, runId)).status).toBe('succeeded')
  return runId
}

test.describe.configure({ mode: 'serial' })

test.describe('Guard › navigation and guardrails', () => {
  test('opens on Overview from the sidebar, with every tab', async ({ page }) => {
    await page.goto(`/${ORGANIZATION.slug}/chat`)
    await page.getByRole('link', { name: 'Guard' }).first().click()
    await expect(page).toHaveURL(`${GUARD}/overview`)
    await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible()
    const tabs = page.getByRole('navigation', { name: 'Guard sections' })
    for (const name of ['Overview', 'Defaults', 'Guardrails', 'Data filters', 'Audit log'])
      await expect(tabs.getByRole('link', { name })).toBeVisible()
  })

  test('arranges an agent that refunds orders', async ({ page }) => {
    await page.goto(`/${ORGANIZATION.slug}/chat`)
    const modelKey = await connectStubModel(page)
    agent = await arrangeRefundAgent(page, { name: `Guarded refunds ${stamp}`, modelKey })
    expect(agent.agentId).toBeTruthy()
  })

  test('adds a blocked action, and the agent is stopped from carrying it out', async ({ page }) => {
    await page.goto(`${GUARD}/guardrails`)
    await expect(page.getByRole('heading', { name: 'Guardrails', level: 1 })).toBeVisible()
    // the approval rule the agent was arranged with is listed
    await expect(rowOf(page, agent.ruleName)).toContainText('Approval rule')

    await page.getByRole('button', { name: 'Add guardrail' }).first().click()
    const sheet = page.getByRole('dialog', { name: 'Add guardrail' })
    await sheet.getByRole('textbox', { name: 'Name' }).fill(RULE)
    await sheet.getByRole('combobox', { name: 'Type' }).click()
    await page.getByRole('option', { name: 'Blocked action' }).click()
    await sheet.getByRole('textbox', { name: 'Action' }).fill('refund_api')
    await sheet.getByRole('button', { name: 'Add guardrail' }).click()
    await expect(sheet).toBeHidden()
    await expect(rowOf(page, RULE)).toContainText('Blocked action')

    // the model asks for a refund; Guard answers "not allowed" and the run still ends
    const before = (await refundsSoFar(page)).length
    await runRefund(page, 'Refund order 4001 for $50')
    expect(await refundsSoFar(page)).toHaveLength(before)
  })

  test('turning the rule off asks for a reason, and refunds go out again', async ({ page }) => {
    await page.goto(`${GUARD}/guardrails`)
    await rowOf(page, RULE).getByRole('switch').click()
    const dialog = page.getByRole('alertdialog', { name: `Turn off “${RULE}”?` })
    await dialog.getByRole('textbox', { name: 'Reason' }).fill('Refunds are allowed again')
    await dialog.getByRole('button', { name: 'Turn off' }).click()
    await expect(page.getByText(`${RULE} is off`)).toBeVisible()

    const before = (await refundsSoFar(page)).length
    await runRefund(page, 'Refund order 4002 for $60')
    const refunds = await refundsSoFar(page)
    expect(refunds).toHaveLength(before + 1)
    expect(refunds.at(-1)).toMatchObject({ orderId: '4002', amount: 60 })
  })

  test('deleting the rule removes it from the table', async ({ page }) => {
    await page.goto(`${GUARD}/guardrails`)
    await rowOf(page, RULE)
      .getByRole('button', { name: new RegExp(RULE) })
      .first()
      .click()
    const sheet = page.getByRole('dialog', { name: RULE })
    await sheet.getByRole('button', { name: 'Delete' }).click()
    const confirm = page.getByRole('alertdialog', { name: `Delete “${RULE}”?` })
    await confirm.getByRole('button', { name: 'Delete rule' }).click()
    await expect(rowOf(page, RULE)).toHaveCount(0)
  })
})

test.describe('Guard › Data filters', () => {
  const sampleOf = (page: Page) => page.getByRole('textbox', { name: 'Sample text' })
  const leaves = (page: Page) => page.getByText('What leaves').locator('..')

  test('shows what would leave for a cloud model, and that a card number stops the request', async ({
    page,
  }) => {
    await page.goto(`${GUARD}/data-filters`)
    await expect(page.getByRole('heading', { name: 'Data filters', level: 1 })).toBeVisible()
    await expect(page.getByText('Local models skip the filter')).toBeVisible()

    // the sample text has an email address, a phone number and a card number; the ML service finds them
    await sampleOf(page).fill(
      "I'm Maria. Email maria@example.com, call +14155550132, card 4111 1111 1111 1111.",
    )
    await expect(page.getByText('A real request would be stopped')).toBeVisible()
    await expect(page.getByText('Email addresses: 1 match · Mask')).toBeVisible()
    await expect(page.getByText('Payment card numbers: 1 match · Block')).toBeVisible()
    await expect(leaves(page)).toContainText('[EMAIL]')
    await expect(leaves(page)).toContainText('[PHONE]')
  })

  test('loosening card numbers to Mask needs a reason, and then the text goes through masked', async ({
    page,
  }) => {
    await page.goto(`${GUARD}/data-filters`)
    await page
      .getByRole('radiogroup', { name: 'Action for Payment card numbers' })
      .getByRole('radio', { name: 'Mask' })
      .click()
    const dialog = page.getByRole('alertdialog', {
      name: 'Loosen the filter for Payment card numbers?',
    })
    await dialog.getByRole('button', { name: 'Loosen filter' }).click()
    await expect(dialog.getByText('Give a reason. It is saved in the audit log.')).toBeVisible()
    await dialog.getByRole('textbox', { name: 'Reason' }).fill('Cards are tokenized upstream')
    await dialog.getByRole('button', { name: 'Loosen filter' }).click()
    await expect(page.getByText('Payment card numbers is set to Mask')).toBeVisible()

    await sampleOf(page).fill('Card 4111 1111 1111 1111 please.')
    await expect(leaves(page)).toContainText('[PAYMENT_CARD]')
    await expect(page.getByText('A real request would be stopped')).toBeHidden()
  })

  test('a custom pattern is found by the ML service', async ({ page }) => {
    await page.goto(`${GUARD}/data-filters`)
    await page.getByRole('button', { name: 'Add custom type' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Add a custom type' })
    await dialog.getByRole('textbox', { name: 'Name' }).fill('Order number')
    await dialog.getByRole('textbox', { name: 'Pattern' }).fill(String.raw`ORD-\d{4}`)
    await dialog.getByRole('button', { name: 'Add type' }).click()
    await expect(page.getByText('Order number added')).toBeVisible()

    await sampleOf(page).fill('Where is ORD-1234?')
    await expect(leaves(page)).toContainText('[ORDER_NUMBER]')
  })
})
