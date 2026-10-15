// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test'

import { callApi, currentOrgId } from './support/api'
import { typeMessage } from './support/composer'
import { ORGANIZATION, OWNER_STATE } from './support/env'
import { waitForHydration } from './support/hydration'
import { connectStubCloudModel, connectStubModel, removeStubModel } from './support/models'
import { priceModel } from './support/usage'
import { startWorker, stopWorker } from './support/worker'

import type { Locator, Page } from '@playwright/test'
import type { ChildProcess } from 'node:child_process'

const USAGE = `/${ORGANIZATION.slug}/settings/usage`
const CHAT = `/${ORGANIZATION.slug}/chat`
/** $5 a month; one answer of the priced stub model costs more. */
const BUDGET_DOLLARS = 5
/** $1 per token: the stub's shortest exchange is well over five tokens. */
const PRICE_MICROS_PER_MTOK = 1_000_000 * 1_000_000

interface VaultFallback {
  version: 1
  order: string[]
  onProviderError: boolean
  timeoutSeconds: number | null
  privateChatsLocalOnly: true
}

let worker: ChildProcess | undefined
let orgId: string
let cloudModelKey: string
let fallbackBefore: VaultFallback | undefined

/** The budget card of the organization in Settings › Usage & budgets. */
const organizationCard = (page: Page) => page.getByRole('region', { name: 'Organization budget' })

/** Picks the stub model on the provider key (a cloud model) or on the local server. */
async function pickModel(page: Page, where: 'cloud' | 'local') {
  await page.getByRole('button', { name: 'Model or agent', exact: true }).click()
  await page
    .getByRole('option', { name: where === 'cloud' ? /Sent to/ : /Stays on your server/ })
    .click()
}

/**
 * Starts a new chat with the stub model on one side and returns the answer, once the chat has
 * its own address: leaving before that is overridden.
 */
async function ask(page: Page, question: string, where: 'cloud' | 'local'): Promise<Locator> {
  await page.goto(CHAT)
  await page.waitForLoadState('networkidle')
  await pickModel(page, where)
  await typeMessage(page, question)
  await page.getByRole('button', { name: 'Send message' }).click()
  // the chat's own page compiles on its first visit under `next dev`
  await expect(page).toHaveURL(new RegExp(`${CHAT}/[0-9a-f-]{36}$`), { timeout: 60_000 })
  return page.getByRole('article', { name: 'Answer' }).last()
}

/** Opens the organization budget's form from its card. */
async function editOrganizationBudget(page: Page) {
  await page.goto(USAGE)
  await organizationCard(page).getByRole('button', { name: 'Edit' }).click()
  return page.getByRole('dialog', { name: 'Edit the organization budget' })
}

// The budget the first spec sets is spent, switched and paused by the next ones. Each spec visits
// several pages, which compile on their first visit under `next dev`.
test.describe.configure({ mode: 'serial', timeout: 120_000 })

/** Starting the worker and the first visit of Chat under `next dev` take longer than one test. */
const ARRANGE_TIMEOUT_MS = 180_000

test.beforeAll(async ({ browser }) => {
  test.setTimeout(ARRANGE_TIMEOUT_MS)
  // the worker sends the alerts: the `budgetAlert` job and the outbox's notifications
  worker = await startWorker()
  const context = await browser.newContext({ storageState: OWNER_STATE })
  try {
    const page = await context.newPage()
    await page.goto(CHAT)
    orgId = await currentOrgId(page)
    const localModelKey = await connectStubModel(page)
    cloudModelKey = await connectStubCloudModel(page)
    priceModel(orgId, cloudModelKey, PRICE_MICROS_PER_MTOK)
    // a reached budget switches to the first local model of the Vault's fallback order
    const settings = await callApi<{ fallback: VaultFallback }>(
      page,
      'GET',
      `/orgs/${orgId}/vault/settings`,
    )
    fallbackBefore = settings.fallback
    await callApi(page, 'PUT', `/orgs/${orgId}/vault/settings`, {
      fallback: { ...settings.fallback, order: [localModelKey] },
    })
  } finally {
    await context.close()
  }
})

test.afterAll(async ({ browser }) => {
  test.setTimeout(ARRANGE_TIMEOUT_MS)
  if (worker) stopWorker(worker)
  const context = await browser.newContext({ storageState: OWNER_STATE })
  try {
    const page = await context.newPage()
    await page.goto(CHAT)
    // a spec that failed halfway may have left the budget: the other specs expect none
    const budgets = await callApi<{ id: string }[]>(page, 'GET', `/orgs/${orgId}/budgets`)
    for (const budget of budgets) {
      await callApi(page, 'DELETE', `/orgs/${orgId}/budgets/${budget.id}`)
    }
    if (fallbackBefore) {
      await callApi(page, 'PUT', `/orgs/${orgId}/vault/settings`, { fallback: fallbackBefore })
    }
    priceModel(orgId, cloudModelKey, null)
    await removeStubModel(page)
  } finally {
    await context.close()
  }
})

test.describe('Usage & budgets', () => {
  test('is in the Settings menu and sets the organization budget', async ({ page }) => {
    await page.goto(`/${ORGANIZATION.slug}/profile`)
    // a click on the server-rendered menu, before React takes it over, is lost
    await waitForHydration(page, 'nav[aria-label="Main navigation"] button')
    const navigation = page.getByRole('navigation', { name: 'Main navigation' })
    await navigation.getByRole('button', { name: 'Settings' }).click()
    await navigation.getByRole('link', { name: 'Usage & budgets' }).click()
    await expect(page).toHaveURL(USAGE, { timeout: 60_000 })
    await expect(page.getByRole('heading', { name: 'Usage & budgets', level: 1 })).toBeVisible()
    await expect(page.getByText('No organization budget.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'No team budgets' })).toBeVisible()

    await organizationCard(page).getByRole('button', { name: 'Set a budget' }).click()
    const dialog = page.getByRole('dialog', { name: 'Set the organization budget' })
    await dialog.getByRole('textbox', { name: 'Monthly amount' }).fill(String(BUDGET_DOLLARS))
    await dialog.getByRole('radio', { name: /Switch to local models/ }).check()
    for (const percent of [50, 80, 100]) {
      await expect(dialog.getByRole('checkbox', { name: `At ${String(percent)}%` })).toBeChecked()
    }
    await dialog.getByRole('button', { name: 'Add budget' }).click()
    await expect(page.getByText('Budget added')).toBeVisible()

    const card = organizationCard(page)
    await expect(card.getByText('On', { exact: true })).toBeVisible()
    await expect(card).toContainText('$0 of $5')
    await expect(card).toContainText('Switch to local models')
    await expect(card).toContainText('50%, 80%, 100%')
  })

  test('a cloud model answers until its cost reaches the budget', async ({ page }) => {
    const answer = await ask(page, 'What does a long answer cost?', 'cloud')
    await expect(answer).toContainText('Echo: What does a long answer cost?')
    await expect(answer).toContainText(/Sent to/)

    await page.goto(USAGE)
    await expect(organizationCard(page)).toContainText(/Reached · local models until/)

    // the Insights overview shows the same meter
    await page.goto(`/${ORGANIZATION.slug}/insights`)
    const meter = page.getByRole('region', { name: 'Budget this month · Organization' })
    await expect(meter).toContainText(/of \$5\b/)
    await expect(meter).toContainText(/Reached · calls use local models until/)
    await meter.getByRole('link', { name: 'Manage budgets' }).click()
    await expect(page).toHaveURL(USAGE)
  })

  test('the alerts at 50, 80 and 100% reach the Owner', async ({ page }) => {
    // one answer went past all three thresholds; each sends its own alert
    await expect
      .poll(
        async () => {
          await page.goto(`/${ORGANIZATION.slug}/notifications`)
          return page.getByText('An AI budget reached its alert threshold').count()
        },
        { timeout: 60_000 },
      )
      .toBe(3)
    await page.goto(USAGE)
    await expect(organizationCard(page)).toContainText(/100% alert/)
  })

  test('once reached, a cloud model is switched to a local model', async ({ page }) => {
    const answer = await ask(page, 'Which model answers now?', 'cloud')
    await expect(answer).toContainText('Echo: Which model answers now?')
    await expect(answer).toContainText('Stays on your server')
  })

  test('pausing cloud models stops the call, and a local model still answers', async ({ page }) => {
    const dialog = await editOrganizationBudget(page)
    await dialog.getByRole('radio', { name: /Pause cloud models/ }).check()
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Budget saved')).toBeVisible()
    await expect(organizationCard(page)).toContainText(/Reached · cloud models paused until/)

    await ask(page, 'Is the cloud paused?', 'cloud')
    const card = page.getByRole('alert').filter({ hasText: 'Budget reached' })
    await expect(card).toBeVisible()
    await expect(card.getByRole('link', { name: 'Open usage and budgets' })).toHaveAttribute(
      'href',
      USAGE,
    )
    await card.getByRole('button', { name: 'Use a local model' }).click()
    await typeMessage(page, 'And a local model?')
    await page.getByRole('button', { name: 'Send message' }).click()
    const answer = page.getByRole('article', { name: 'Answer' }).last()
    // the stub echoes every question since the last answer: the refused one and this one
    await expect(answer).toContainText('And a local model?')
    await expect(answer).toContainText('Stays on your server')
  })

  test('raising the budget lets the cloud model answer again', async ({ page }) => {
    const dialog = await editOrganizationBudget(page)
    await dialog.getByRole('textbox', { name: 'Monthly amount' }).fill('100000')
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Budget saved')).toBeVisible()

    const answer = await ask(page, 'Is the cloud back?', 'cloud')
    await expect(answer).toContainText('Echo: Is the cloud back?')
    await expect(answer).toContainText(/Sent to/)
  })

  test('deletes the organization budget after a confirmation', async ({ page }) => {
    await page.goto(USAGE)
    await organizationCard(page)
      .getByRole('button', { name: 'Delete the organization budget' })
      .click()
    const confirm = page.getByRole('alertdialog', { name: 'Delete the organization budget?' })
    await confirm.getByRole('button', { name: 'Delete budget' }).click()
    await expect(page.getByText('Organization budget deleted')).toBeVisible()
    await expect(page.getByText('No organization budget.')).toBeVisible()
  })
})
