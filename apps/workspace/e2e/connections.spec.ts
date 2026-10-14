// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test'

import {
  OAUTH_CLIENT_ID,
  OAUTH_CLIENT_SECRET,
  oauthServerUrl,
  ORGANIZATION,
  webUrl,
} from './support/env'

import type { Locator, Page } from '@playwright/test'

const CONNECTIONS = `/${ORGANIZATION.slug}/settings/connections`
const stamp = String(Date.now())
const NAME = `Orders API ${stamp}`
const RENAMED = `Orders API (billing) ${stamp}`

const table = (page: Page) => page.getByRole('table', { name: 'Connections' })
const rowOf = (page: Page, name: string) => table(page).getByRole('row').filter({ hasText: name })

async function openConnections(page: Page) {
  await page.goto(CONNECTIONS)
  await expect(page.getByRole('heading', { name: 'Connections', level: 1 })).toBeVisible()
}

/** The stub's counters: what it issued and how many checks it accepted and refused. */
async function stubStats(page: Page) {
  const response = await page.request.get(`${oauthServerUrl}/control/stats`)
  return (await response.json()) as { issued: number; accepted: number; rejected: number }
}

/** Opens Add connection on the Custom API step that asks for a client ID and secret. */
async function openCustomApi(page: Page) {
  await page.getByRole('button', { name: 'Add connection' }).first().click()
  await page
    .getByRole('dialog', { name: 'Add connection' })
    .getByRole('button', { name: 'Custom API' })
    .click()
  // the dialog is named after the app from the second step on
  const dialog = page.getByRole('dialog', { name: 'Connect Custom API' })
  await expect(dialog.getByText('Step 2 of 3')).toBeVisible()
  await dialog.getByRole('radio', { name: 'Client ID and secret' }).click()
  return dialog
}

async function fillClientCredentials(dialog: Locator, values: { name: string; secret: string }) {
  await dialog.getByRole('textbox', { name: /^Name/ }).fill(values.name)
  await dialog.getByRole('textbox', { name: 'Address' }).fill(`${oauthServerUrl}/api`)
  await dialog.getByRole('textbox', { name: 'Token URL' }).fill(`${oauthServerUrl}/oauth/token`)
  await dialog.getByRole('textbox', { name: 'Client ID' }).fill(OAUTH_CLIENT_ID)
  await dialog.getByLabel('Client secret').fill(values.secret)
  await dialog.getByRole('button', { name: 'Next' }).click()
  await expect(dialog.getByText('Step 3 of 3')).toBeVisible()
  await dialog.getByRole('radio', { name: /^Organization/ }).click()
}

async function openRowMenu(page: Page, name: string, item: string) {
  await rowOf(page, name)
    .getByRole('button', { name: `Actions for ${name}` })
    .click()
  await page.getByRole('menuitem', { name: item }).click()
}

// One custom API connection is added, checked, broken, reconnected, renamed and disconnected, in order.
test.describe.configure({ mode: 'serial' })

test.describe('Settings › Connections', () => {
  test('starts empty and offers the apps this install can sign in to', async ({ page }) => {
    await openConnections(page)
    await expect(page.getByText('Connect the apps your agents and knowledge need')).toBeVisible()

    await page.getByRole('button', { name: 'Add connection' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Add connection' })
    // Slack, Notion and Google Drive have OAuth apps on this install (Drive and Notion on the stub
    // server); an app without one is the dialog's component test
    await expect(dialog.getByRole('button', { name: 'Slack' })).toBeEnabled()
    await expect(dialog.getByRole('button', { name: 'Notion' })).toBeEnabled()
    await expect(dialog.getByRole('button', { name: 'Google Drive' })).toBeEnabled()
    await expect(dialog.getByText(/Not set up on this install/)).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Custom API' })).toBeEnabled()
  })

  test('refuses wrong client credentials and saves nothing', async ({ page }) => {
    await openConnections(page)
    const dialog = await openCustomApi(page)
    await fillClientCredentials(dialog, { name: NAME, secret: 'not-the-secret' })
    await dialog.getByRole('button', { name: 'Connect', exact: true }).click()
    await expect(dialog.getByRole('alert')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(page.getByText(NAME)).toHaveCount(0)
  })

  test('connects a custom API through the stub OAuth app and lists it as active', async ({
    page,
  }) => {
    await openConnections(page)
    const before = await stubStats(page)
    const dialog = await openCustomApi(page)
    await fillClientCredentials(dialog, { name: NAME, secret: OAUTH_CLIENT_SECRET })
    await dialog.getByRole('button', { name: 'Connect', exact: true }).click()
    await expect(dialog).toBeHidden()
    // a custom API is named by its address
    await expect(page.getByText(`Connected as ${new URL(oauthServerUrl).host}`)).toBeVisible()

    const row = rowOf(page, NAME)
    await expect(row).toContainText('Active')
    await expect(row).toContainText('API tool')
    await expect(row).toContainText('Organization')
    // the stub issued a token for it and answered the first check
    const after = await stubStats(page)
    expect(after.issued).toBeGreaterThan(before.issued)
    expect(after.accepted).toBeGreaterThan(before.accepted)
  })

  test('tests the connection against the app, and reports it once the app refuses the token', async ({
    page,
  }) => {
    await openConnections(page)
    await openRowMenu(page, NAME, 'Test')
    await expect(page.getByText(`${NAME} is working`)).toBeVisible()

    // the app expires every token it issued
    await page.request.post(`${oauthServerUrl}/control/revoke`)
    await openRowMenu(page, NAME, 'Test')
    await expect(page.getByText(new RegExp(`${NAME} failed its check`))).toBeVisible()
    await expect(rowOf(page, NAME)).not.toContainText('Active')
    await expect(page.getByText(/1 connection needs attention/)).toBeVisible()
  })

  test('reconnects with fresh credentials and is active again', async ({ page }) => {
    await openConnections(page)
    const before = await stubStats(page)
    await openRowMenu(page, NAME, 'Reconnect')
    const dialog = page.getByRole('dialog', { name: `Reconnect ${NAME}` })
    await dialog.getByRole('textbox', { name: 'Token URL' }).fill(`${oauthServerUrl}/oauth/token`)
    await dialog.getByRole('textbox', { name: 'Client ID' }).fill(OAUTH_CLIENT_ID)
    await dialog.getByLabel('Client secret').fill(OAUTH_CLIENT_SECRET)
    await dialog.getByRole('button', { name: 'Reconnect', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText(`Reconnected ${NAME}`)).toBeVisible()
    await expect(rowOf(page, NAME)).toContainText('Active')
    expect((await stubStats(page)).issued).toBeGreaterThan(before.issued)
  })

  test('renames the connection', async ({ page }) => {
    await openConnections(page)
    await openRowMenu(page, NAME, 'Rename or edit address')
    const dialog = page.getByRole('dialog', { name: 'Rename connection or edit its address' })
    await dialog.getByRole('textbox', { name: 'Name' }).fill(RENAMED)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toBeHidden()
    await expect(rowOf(page, RENAMED)).toContainText('Active')
    await expect(rowOf(page, NAME)).toHaveCount(0)
  })

  test('keeps the connection until the disconnect is confirmed, then hides it', async ({
    page,
  }) => {
    await openConnections(page)
    await openRowMenu(page, RENAMED, 'Disconnect…')
    const dialog = page.getByRole('alertdialog', { name: `Disconnect ${RENAMED}?` })
    await expect(dialog.getByText(/Nothing uses this connection/)).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(rowOf(page, RENAMED)).toBeVisible()

    await openRowMenu(page, RENAMED, 'Disconnect…')
    await page
      .getByRole('alertdialog', { name: `Disconnect ${RENAMED}?` })
      .getByRole('button', { name: 'Disconnect', exact: true })
      .click()
    await expect(page.getByText(`Disconnected ${RENAMED}`)).toBeVisible()
    await expect(rowOf(page, RENAMED)).toHaveCount(0)

    // a disconnected connection shows only under that filter
    await page.getByRole('combobox', { name: 'Status' }).click()
    await page.getByRole('option', { name: 'Disconnected' }).click()
    await expect(rowOf(page, RENAMED)).toContainText('Disconnected')
  })
})

test.describe('Settings › Connections › returning from an app', () => {
  test('forwards the app’s return address to the organization’s page', async ({ page }) => {
    // an attempt the API never started: the page explains it and saves nothing
    await page.goto('/settings/connections/callback?code=unknown&state=unknown')
    await expect(page).toHaveURL(new RegExp(`^${webUrl}${CONNECTIONS}/callback\\?`))
    await expect(page.getByText('That sign-in took too long')).toBeVisible()
    await expect(page.getByText('Nothing was saved.')).toBeVisible()
  })

  test('a declined sign-in at the app saves nothing', async ({ page }) => {
    await openConnections(page)
    // the browser never reaches Slack: the spec answers for it, as Slack does when a person declines
    await page.route('https://slack.com/**', async (route) => {
      const state = new URL(route.request().url()).searchParams.get('state') ?? ''
      const back = new URL('/settings/connections/callback', webUrl)
      back.searchParams.set('error', 'access_denied')
      back.searchParams.set('state', state)
      await route.fulfill({ status: 302, headers: { location: back.toString() } })
    })

    await page.getByRole('button', { name: 'Add connection' }).first().click()
    await page
      .getByRole('dialog', { name: 'Add connection' })
      .getByRole('button', { name: 'Slack' })
      .click()
    const dialog = page.getByRole('dialog', { name: 'Connect Slack' })
    const next = dialog.getByRole('button', { name: 'Next' })
    if (await next.isVisible()) await next.click()
    await dialog.getByRole('button', { name: 'Continue with Slack' }).click()

    await expect(page).toHaveURL(new RegExp(`${CONNECTIONS}/callback`), { timeout: 60_000 })
    await expect(page.getByText("The app didn't finish connecting")).toBeVisible()
    await expect(page.getByText('Nothing was saved.')).toBeVisible()
  })
})
