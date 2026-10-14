// SPDX-License-Identifier: AGPL-3.0-only
import { expect, request as playwrightRequest, test } from '@playwright/test'

import type { ApiKeyCreatedDto } from '@surefy/contracts'

import { arrangeRefundAgent, cleanUp } from './support/agents'
import { callApi } from './support/api'
import { apiUrl, ORGANIZATION, OWNER_STATE } from './support/env'
import { connectStubModel } from './support/models'
import { refreshOwnerSession } from './support/session'
import { rollUpUsage } from './support/usage'
import { startWorker, stopWorker } from './support/worker'

import type { RefundAgent } from './support/agents'
import type { Page } from '@playwright/test'
import type { ChildProcess } from 'node:child_process'

const INSIGHTS = `/${ORGANIZATION.slug}/insights`
const stamp = String(Date.now())
const NAME = `Refund desk ${stamp}`
/** Starting the worker, publishing and two runs that finish on it take longer than one test. */
const ARRANGE_TIMEOUT_MS = 180_000

let worker: ChildProcess | undefined
let agent: RefundAgent | undefined
/** The run that went straight through, and the one a person approved. */
const runs = { direct: '', approved: '' }

/** A call to the organization's public API with a key, at the API's own address. */
async function callRunApi(secret: string, method: 'GET' | 'POST', path: string, body?: unknown) {
  const api = await playwrightRequest.newContext()
  try {
    const response = await api.fetch(`${apiUrl}/api/v1/orgs/${agent?.orgId ?? ''}${path}`, {
      method,
      headers: { authorization: `Bearer ${secret}` },
      ...(body === undefined ? {} : { data: body }),
    })
    expect(response.ok()).toBe(true)
    return ((await response.json()) as { data: { id: string; status: string } }).data
  } finally {
    await api.dispose()
  }
}

/** Starts a run of the live version over the API and waits until it reaches a status. */
async function runOverApi(secret: string, input: string, status: string): Promise<string> {
  if (!agent) throw new Error('The agent was not arranged')
  const run = await callRunApi(secret, 'POST', `/agents/${agent.agentId}/runs`, { input })
  await expect
    .poll(async () => (await callRunApi(secret, 'GET', `/runs/${run.id}`)).status, {
      timeout: 60_000,
    })
    .toBe(status)
  return run.id
}

/** Opens the overview and waits for its heading (`next dev` compiles it on its first visit). */
async function openOverview(page: Page) {
  await page.goto(INSIGHTS)
  await expect(page.getByRole('heading', { name: 'Insights', level: 1 })).toBeVisible()
}

// The runs that the setup starts are the ones every spec reads.
test.describe.configure({ mode: 'serial', timeout: 120_000 })

test.beforeAll(async ({ browser }) => {
  test.setTimeout(ARRANGE_TIMEOUT_MS)
  // creating an API key and deciding an approval need a recent sign-in
  await refreshOwnerSession(browser)
  // a run executes, and resumes after a decision, in the worker
  worker = await startWorker()
  const context = await browser.newContext({ storageState: OWNER_STATE })
  try {
    const page = await context.newPage()
    await page.goto(INSIGHTS)
    const modelKey = await connectStubModel(page)
    agent = await arrangeRefundAgent(page, { name: NAME, modelKey })
    const draft = await callApi<{ revision: number }>(
      page,
      'GET',
      `/orgs/${agent.orgId}/agents/${agent.agentId}/draft`,
    )
    await callApi(page, 'POST', `/orgs/${agent.orgId}/agents/${agent.agentId}/publish`, {
      baseRevision: draft.revision,
      channels: [{ type: 'api' }],
    })
    const key = await callApi<ApiKeyCreatedDto>(page, 'POST', `/orgs/${agent.orgId}/api-keys`, {
      name: `Insights key ${stamp}`,
      scopes: ['agents:invoke'],
    })

    runs.direct = await runOverApi(key.secret, 'Refund order 3001 for $90', 'succeeded')
    runs.approved = await runOverApi(key.secret, 'Refund order 3002 for $450', 'waiting_approval')
    const [approval] = await callApi<{ id: string }[]>(
      page,
      'GET',
      `/orgs/${agent.orgId}/approvals?agentId=${agent.agentId}&status=pending`,
    )
    if (!approval) throw new Error('The refund above the rule asked for no approval')
    await callApi(page, 'POST', `/orgs/${agent.orgId}/approvals/${approval.id}/approve`, {})
    await expect
      .poll(async () => (await callRunApi(key.secret, 'GET', `/runs/${runs.approved}`)).status, {
        timeout: 60_000,
      })
      .toBe('succeeded')
    await callApi(page, 'POST', `/orgs/${agent.orgId}/api-keys/${key.apiKey.id}/revoke`)
  } finally {
    await context.close()
  }
  // the run KPIs read the hourly rollup, which the worker builds only at five past the hour
  rollUpUsage()
})

test.afterAll(async ({ browser }) => {
  test.setTimeout(ARRANGE_TIMEOUT_MS)
  if (worker) stopWorker(worker)
  await cleanUp(browser, agent)
})

test.describe('Insights › agent runs', () => {
  test('the overview counts the runs of one agent, their success and the approvals by people', async ({
    page,
  }) => {
    await openOverview(page)
    // other specs ran agents in this organization too: the agent filter keeps to this one
    await page.getByRole('combobox', { name: 'Agent' }).click()
    await page.getByRole('option', { name: NAME }).click()
    await expect(page).toHaveURL(new RegExp(`agent=${agent?.agentId ?? ''}`))

    const kpis = page.getByRole('region', { name: 'Agent runs' })
    await expect(kpis).toContainText(/Runs\s*2(?!\d)/)
    await expect(kpis).toContainText(/Success rate\s*100\s*%/)
    await expect(kpis).toContainText('Average duration')
    await expect(kpis).toContainText('1 approved · 0 rejected')
    await expect(page.getByRole('region', { name: 'Runs over time' })).toBeVisible()
  })

  test('groups the cost by agent, and "See runs" keeps the agent', async ({ page }) => {
    await page.goto(`${INSIGHTS}?agent=${agent?.agentId ?? ''}`)
    const cost = page.getByRole('region', { name: /^Cost by/ })
    await cost.getByRole('radio', { name: 'Agent' }).click()
    await expect(cost).toHaveAccessibleName('Cost by agent')
    await cost.getByRole('radio', { name: 'Table' }).click()
    await expect(cost.getByRole('table')).toContainText(NAME)

    await page
      .getByRole('region', { name: 'Runs over time' })
      .getByRole('link', { name: 'See runs' })
      .click()
    await expect(page).toHaveURL(new RegExp(`${INSIGHTS}/runs\\?.*agent=${agent?.agentId ?? ''}`))
  })

  test('the Runs tab lists the API runs and finds one by its id', async ({ page }) => {
    await openOverview(page)
    await page
      .getByRole('navigation', { name: 'Insights sections' })
      .getByRole('link', { name: 'Runs' })
      .click()
    await expect(page).toHaveURL(`${INSIGHTS}/runs`)
    await expect(page.getByRole('heading', { name: 'Runs', level: 1 })).toBeVisible()

    const table = page.getByRole('table', { name: 'Runs' })
    const ours = table.getByRole('row').filter({ hasText: NAME })
    await expect(ours).toHaveCount(2)
    await expect(ours.first()).toContainText('API')
    await expect(ours.first()).toContainText('Done')

    await page.getByLabel('Search runs').fill(runs.approved)
    await expect(table.getByRole('row').filter({ hasText: NAME })).toHaveCount(1)
    await expect(page).toHaveURL(/q=/)
  })

  test('a run opens with its facts, steps and the approval it waited for', async ({ page }) => {
    await page.goto(`${INSIGHTS}/runs?q=${runs.approved}`)
    await page
      .getByRole('table', { name: 'Runs' })
      .getByRole('row')
      .filter({ hasText: NAME })
      .click()
    await expect(page).toHaveURL(`${INSIGHTS}/runs/${runs.approved}`)
    await expect(page.getByRole('heading', { name: /^Run /, level: 1 })).toBeVisible()
    await expect(page.getByText('Done').first()).toBeVisible()

    const steps = page.getByRole('region', { name: 'Steps' })
    await expect(steps).toContainText('Model')
    await expect(steps).toContainText('Tool')
    await expect(steps).toContainText('Approval')
    const side = page.getByRole('complementary', { name: 'About this run' })
    await expect(side).toContainText('refund_api')
    await expect(side).toContainText('Approval history')

    // a channel run that answered is not run again; only one that failed, or a test run, is
    await expect(page.getByRole('button', { name: 'Re-run in test mode' })).toHaveCount(0)
  })
})
