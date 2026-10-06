// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test'

import { typeMessage } from './support/composer'
import { ORGANIZATION, OWNER, STUB_MODEL_ID } from './support/env'
import { connectStubModel } from './support/models'

import type { Page } from '@playwright/test'

const INSIGHTS = `/${ORGANIZATION.slug}/insights`

/** Asks the stub model one question, so the day has usage to show. */
async function chatOnce(page: Page, question: string) {
  await page.goto(INSIGHTS)
  await connectStubModel(page)
  await page.goto(`/${ORGANIZATION.slug}/chat`)
  await page.waitForLoadState('networkidle')
  await typeMessage(page, question)
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByRole('article', { name: 'Answer' }).last()).toContainText(
    `Echo: ${question}`,
  )
  // the chat takes its own address once the answer is in; leaving before that is overridden
  await expect(page).toHaveURL(new RegExp(`/${ORGANIZATION.slug}/chat/[0-9a-f-]{36}$`))
}

/**
 * "Today" and "Last 7 days" read the usage events; longer ranges read the daily rollup that the
 * worker's hourly job builds, and the worker does not run in the end-to-end stack.
 */
async function showToday(page: Page) {
  await page.goto(INSIGHTS)
  await page.getByRole('combobox', { name: 'Date range' }).click()
  await page.getByRole('option', { name: 'Today' }).click()
}

// The first spec creates the usage that the others read.
test.describe.configure({ mode: 'serial' })

test.describe('Insights', () => {
  test('is in the navigation, and shows what the chats of the day used', async ({ page }) => {
    await chatOnce(page, 'How much did this cost?')

    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: /Insights/ })
      .click()
    await expect(page).toHaveURL(INSIGHTS)
    await expect(page.getByRole('heading', { name: 'Insights', level: 1 })).toBeVisible()

    await showToday(page)
    const kpis = page.getByRole('region', { name: 'Key numbers' })
    await expect(kpis).toContainText(/Messages\s*[1-9]/)
    await expect(kpis).toContainText(/Active people\s*1/)
    await expect(kpis).toContainText(/Tokens\s*[1-9]/)
    await expect(page.getByRole('region', { name: 'Tokens over time' })).toBeVisible()
  })

  test('groups the cost by team, person and model, as a chart or a table', async ({ page }) => {
    await showToday(page)
    const cost = page.getByRole('region', { name: /^Cost by/ })
    await expect(cost).toHaveAccessibleName('Cost by team')
    await expect(cost.getByRole('radio', { name: 'Team' })).toBeChecked()

    await cost.getByRole('radio', { name: 'Person' }).click()
    await expect(cost).toHaveAccessibleName('Cost by person')
    await cost.getByRole('radio', { name: 'Table' }).click()
    await expect(cost.getByRole('table')).toContainText(OWNER.name)

    await cost.getByRole('radio', { name: 'Model' }).click()
    await expect(cost).toHaveAccessibleName('Cost by model')
    // the stub is a local model: listed with the usage it had, at no cost
    await expect(cost.getByRole('table')).toContainText(STUB_MODEL_ID)
    await cost.getByRole('radio', { name: 'Chart' }).click()
    await expect(cost.getByRole('img', { name: 'Cost per model' })).toBeVisible()
  })

  test('filters by person and by model', async ({ page }) => {
    await showToday(page)
    const kpis = page.getByRole('region', { name: 'Key numbers' })
    await expect(kpis).toContainText(/Messages\s*[1-9]/)

    await page.getByRole('combobox', { name: 'Person' }).click()
    await page.getByRole('option', { name: new RegExp(OWNER.name) }).click()
    await expect(page).toHaveURL(/person=/)
    await expect(kpis).toContainText(/Messages\s*[1-9]/)

    await page.getByRole('combobox', { name: 'Model' }).click()
    await page.getByRole('option', { name: new RegExp(STUB_MODEL_ID) }).click()
    await expect(page).toHaveURL(/model=/)
    await expect(kpis).toContainText(/Active people\s*1/)
  })

  test('starts a CSV export and says it is being prepared', async ({ page }) => {
    await showToday(page)
    await page.getByRole('button', { name: 'Export CSV' }).click()
    const dialog = page.getByRole('dialog', { name: 'Export usage' })
    await expect(dialog.getByText('This file contains personal data')).toBeVisible()
    await dialog.getByRole('button', { name: 'Prepare export' }).click()
    // the worker builds the file, and it does not run here: the request is accepted and waits
    await expect(dialog.getByText(/Preparing your export/)).toBeVisible()
  })
})
