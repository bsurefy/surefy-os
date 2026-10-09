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
const QUEUE = `/${ORGANIZATION.slug}/insights/approvals`

let worker: ChildProcess
let agent: RefundAgent
const runs: Record<'approved' | 'edited' | 'rejected', string> = {
  approved: '',
  edited: '',
  rejected: '',
}

test.beforeAll(async () => {
  // a run executes, and resumes after a decision, in the worker
  worker = await startWorker()
})
test.afterAll(async ({ browser }) => {
  stopWorker(worker)
  await cleanUp(browser, agent)
})

/** Waits for the run to reach a status; runs move on the worker, not on the page. */
async function waitForRun(page: Page, runId: string, status: string) {
  await expect.poll(async () => (await readRun(page, agent, runId)).status).toBe(status)
}

test.describe.configure({ mode: 'serial' })

test.describe('Guard and approvals on the real API', () => {
  test('arranges an agent that refunds orders, with a rule above 200', async ({ page }) => {
    await page.goto(`/${ORGANIZATION.slug}/chat`)
    const modelKey = await connectStubModel(page)
    agent = await arrangeRefundAgent(page, { name: `Refunds ${stamp}`, modelKey })
    expect(agent.agentId).toBeTruthy()
  })

  test('a refund under the rule runs without asking anyone', async ({ page }) => {
    await page.goto(`/${ORGANIZATION.slug}/chat`)
    const before = (await refundsSoFar(page)).length
    const runId = await startTestRun(page, agent, 'Refund order 1001 for $120')
    await waitForRun(page, runId, 'succeeded')
    expect(await refundsSoFar(page)).toHaveLength(before + 1)
  })

  test('a refund above the rule waits for a person, and nothing is refunded yet', async ({
    page,
  }) => {
    await page.goto(`/${ORGANIZATION.slug}/chat`)
    const before = (await refundsSoFar(page)).length
    runs.approved = await startTestRun(page, agent, 'Refund order 1182 for $340')
    await waitForRun(page, runs.approved, 'waiting_approval')
    expect(await refundsSoFar(page)).toHaveLength(before)

    await page.goto(QUEUE)
    await expect(page.getByRole('heading', { name: 'Approvals', level: 1 })).toBeVisible()
    const row = page.getByRole('table', { name: 'Approvals' }).getByRole('row').nth(1)
    await expect(row).toContainText('AI action')
    await expect(row).toContainText(agent.ruleName)
  })

  test('the top-bar popover lists it and opens it for review', async ({ page }) => {
    await page.goto(`/${ORGANIZATION.slug}/chat`)
    await page.getByRole('button', { name: /^Approvals, 1 waiting for you/ }).click()
    await expect(page.getByText(agent.ruleName)).toBeVisible()
    await page.getByRole('link', { name: 'Review' }).click()
    await expect(page).toHaveURL(new RegExp(`${QUEUE}/[0-9a-f-]{36}$`))
    await expect(page.getByRole('heading', { name: 'refund_api', level: 1 })).toBeVisible()
    // what the agent asked for, as the AI proposed it
    await expect(page.getByRole('code')).toHaveText('refund_api')
    await expect(page.getByText('1182', { exact: true })).toBeVisible()
    await expect(page.getByText('340', { exact: true })).toBeVisible()
  })

  test('approving it resumes the run, and the refund goes out as asked', async ({ page }) => {
    const before = (await refundsSoFar(page)).length
    await page.goto(QUEUE)
    await page.getByRole('table', { name: 'Approvals' }).getByRole('row').nth(1).click()
    await page.getByRole('button', { name: 'Approve', exact: true }).click()
    await waitForRun(page, runs.approved, 'succeeded')

    const refunds = await refundsSoFar(page)
    expect(refunds).toHaveLength(before + 1)
    expect(refunds.at(-1)).toMatchObject({ orderId: '1182', amount: 340 })
  })

  test('edit and approve sends the corrected amount', async ({ page }) => {
    await page.goto(`/${ORGANIZATION.slug}/chat`)
    const before = (await refundsSoFar(page)).length
    runs.edited = await startTestRun(page, agent, 'Refund order 2001 for $300')
    await waitForRun(page, runs.edited, 'waiting_approval')

    await page.goto(QUEUE)
    await page.getByRole('table', { name: 'Approvals' }).getByRole('row').nth(1).click()
    await page.getByRole('button', { name: 'Edit and approve' }).click()
    await page.getByRole('textbox', { name: 'Amount' }).fill('250')
    await page.getByRole('button', { name: 'Approve with edits' }).click()
    await waitForRun(page, runs.edited, 'succeeded')

    const refunds = await refundsSoFar(page)
    expect(refunds).toHaveLength(before + 1)
    expect(refunds.at(-1)).toMatchObject({ orderId: '2001', amount: 250 })
  })

  test('rejecting it sends no refund, and the run still ends', async ({ page }) => {
    await page.goto(`/${ORGANIZATION.slug}/chat`)
    const before = (await refundsSoFar(page)).length
    runs.rejected = await startTestRun(page, agent, 'Refund order 3001 for $450')
    await waitForRun(page, runs.rejected, 'waiting_approval')

    await page.goto(QUEUE)
    await page.getByRole('table', { name: 'Approvals' }).getByRole('row').nth(1).click()
    await page.getByRole('button', { name: 'Reject', exact: true }).click()
    const dialog = page.getByRole('alertdialog')
    await dialog.getByRole('combobox', { name: 'Reason' }).click()
    await page.getByRole('option', { name: 'Not eligible' }).click()
    await dialog.getByRole('button', { name: 'Reject', exact: true }).click()
    await waitForRun(page, runs.rejected, 'succeeded')

    expect(await refundsSoFar(page)).toHaveLength(before)
  })

  test('the decisions show under Decided today', async ({ page }) => {
    await page.goto(QUEUE)
    await expect(page.getByText('All caught up')).toBeVisible()
    await page.getByRole('radio', { name: 'Decided today' }).click()
    const rows = page.getByRole('table', { name: 'Approvals' }).getByRole('row')
    await expect(rows).toHaveCount(4) // the header and three decisions
    await expect(rows.filter({ hasText: 'Rejected' })).toHaveCount(1)
    await expect(rows.filter({ hasText: 'Approved' })).toHaveCount(2)
  })
})
