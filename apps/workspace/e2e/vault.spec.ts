// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test'

import { callApi, currentOrgId } from './support/api'
import { modelServerUrl, ORGANIZATION, STUB_MODEL_ID } from './support/env'

import type { Page } from '@playwright/test'

const VAULT = `/${ORGANIZATION.slug}/settings/vault`
const LOCAL_MODELS = `${VAULT}/local-models`

/** The server name of this spec; the chat spec's own `E2E model server` is never touched. */
const SERVER_NAME = `Spec server ${String(Date.now())}`

const servers = (page: Page) => page.getByRole('table', { name: 'Local servers' })
const models = (page: Page) => page.getByRole('table', { name: 'Local models' })

/**
 * Opens a dialog from a button of the page. The Settings shell regenerates its tree on the client
 * after a hydration mismatch, which can swallow a click made right after the page loads, so the
 * click is retried until the dialog stays open.
 */
async function openDialog(page: Page, url: string, button: string, dialog: string) {
  await page.goto(url)
  const opened = page.getByRole('dialog', { name: dialog })
  await expect(async () => {
    await page.getByRole('button', { name: button }).first().click()
    await expect(opened).toBeVisible({ timeout: 2_000 })
  }).toPass()
  return opened
}

const openAddServer = (page: Page) =>
  openDialog(page, LOCAL_MODELS, 'Add local server', 'Add local server')

// One server is added, used and removed across the specs, in order.
test.describe.configure({ mode: 'serial' })

test.describe('Settings › Vault › Local models', () => {
  test('opens on the Vault tabs', async ({ page }) => {
    await page.goto(VAULT)
    await expect(page.getByRole('heading', { name: 'Vault', level: 1 })).toBeVisible()
    const tabs = page.getByRole('navigation', { name: 'Vault sections' })
    for (const name of ['Providers & keys', 'Local models', 'Model access', 'Fallback']) {
      await expect(tabs.getByRole('link', { name })).toBeVisible()
    }
  })

  test('refuses a server it cannot reach and saves nothing', async ({ page }) => {
    const dialog = await openAddServer(page)
    await dialog.getByLabel('Name').fill('Unreachable server')
    // nothing listens on the port next to the stub model server
    await dialog
      .getByLabel('Base URL')
      .fill(`http://127.0.0.1:${String(Number(new URL(modelServerUrl).port) + 1)}`)
    await dialog.getByRole('button', { name: 'Test connection' }).click()
    await expect(dialog.getByText('The connection test failed')).toBeVisible()
    await expect(dialog.getByText(/Address checked:/)).toBeVisible()

    await expect(dialog.getByRole('button', { name: 'Add server' })).toBeDisabled()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText('Unreachable server')).toHaveCount(0)
  })

  test('tests the connection, adds a local server and lists its models disabled', async ({
    page,
  }) => {
    const dialog = await openAddServer(page)
    await dialog.getByLabel('Name').fill(SERVER_NAME)
    await dialog.getByLabel('Base URL').fill(modelServerUrl)
    await dialog.getByRole('button', { name: 'Test connection' }).click()
    await expect(dialog.getByText(/Connection works/)).toBeVisible()
    await expect(dialog.getByText(new RegExp(`1 model available: ${STUB_MODEL_ID}`))).toBeVisible()

    await dialog.getByRole('button', { name: 'Add server' }).click()
    await expect(dialog).toBeHidden()
    const row = servers(page).getByRole('row').filter({ hasText: SERVER_NAME })
    await expect(row).toContainText('Online')
    await expect(row).toContainText('Organization')

    // a model starts disabled; the chat spec's own server may already have enabled its model
    const model = models(page).getByRole('row').filter({ hasText: SERVER_NAME })
    await expect(model).toContainText(STUB_MODEL_ID)
    await expect(model.getByRole('switch', { name: `Enable ${STUB_MODEL_ID}` })).not.toBeChecked()
  })

  test('enables the model, and Model access then shows who may use it', async ({ page }) => {
    await page.goto(LOCAL_MODELS)
    const row = models(page).getByRole('row').filter({ hasText: SERVER_NAME })
    await row.getByRole('switch', { name: `Enable ${STUB_MODEL_ID}` }).click()
    await expect(page.getByText(`${STUB_MODEL_ID} was enabled`)).toBeVisible()
    await expect(row.getByRole('switch')).toBeChecked()

    await page.goto(`${VAULT}/model-access`)
    const access = page.getByRole('table', { name: 'Model access' })
    const entry = access.getByRole('row').filter({ hasText: STUB_MODEL_ID }).first()
    await expect(entry).not.toContainText('Disabled')
    // enabling a model for the first time grants it to the whole organization
    await expect(entry).toContainText('Everyone in the organization')
  })

  test('syncs the server and tests its connection again', async ({ page }) => {
    await page.goto(LOCAL_MODELS)
    const row = servers(page).getByRole('row').filter({ hasText: SERVER_NAME })
    await row.getByRole('button', { name: `Actions for ${SERVER_NAME}` }).click()
    await page.getByRole('menuitem', { name: 'Sync models' }).click()
    await expect(page.getByText(`${SERVER_NAME} synced · 0 added, 0 removed`)).toBeVisible()
  })

  test('records the server and the enabled model in the audit log', async ({ page }) => {
    await page.goto(LOCAL_MODELS)
    const orgId = await currentOrgId(page)
    const actions = async (action: string) =>
      (
        await callApi<{ action: string }[]>(
          page,
          'GET',
          `/orgs/${orgId}/audit/entries?action=${action}&limit=50`,
        )
      ).map((entry) => entry.action)
    expect(await actions('vault_server.added')).toContain('vault_server.added')
    expect(await actions('vault_model.enabled')).toContain('vault_model.enabled')
  })

  test('removes the server and its models', async ({ page }) => {
    await page.goto(LOCAL_MODELS)
    const row = servers(page).getByRole('row').filter({ hasText: SERVER_NAME })
    await row.getByRole('button', { name: `Actions for ${SERVER_NAME}` }).click()
    await page.getByRole('menuitem', { name: 'Remove server' }).click()
    const confirm = page.getByRole('alertdialog', { name: `Remove ${SERVER_NAME}?` })
    await confirm.getByRole('button', { name: 'Remove server' }).click()
    await expect(page.getByText(`${SERVER_NAME} was removed`)).toBeVisible()
    await expect(servers(page).getByRole('row').filter({ hasText: SERVER_NAME })).toHaveCount(0)
  })
})

const KEY_NAME = `Spec key ${String(Date.now())}`
const KEY_SECRET = 'sk-e2e-spec-key-0123456789'
const keys = (page: Page) => page.getByRole('table', { name: 'API keys' })

test.describe('Settings › Vault › Providers & keys', () => {
  test('adds an API key after a passing test, and never shows it again', async ({ page }) => {
    const dialog = await openDialog(page, `${VAULT}/providers`, 'Add API key', 'Add API key')
    await dialog.getByLabel('Provider').click()
    await page.getByRole('option', { name: 'OpenAI-compatible' }).click()
    await dialog.getByLabel('Name').fill(KEY_NAME)
    await dialog.getByLabel('Base URL').fill(`${modelServerUrl}/v1`)
    await dialog.getByLabel('API key', { exact: true }).fill(KEY_SECRET)
    await expect(dialog.getByRole('button', { name: 'Save key' })).toBeDisabled()

    await dialog.getByRole('button', { name: 'Test connection' }).click()
    await expect(dialog.getByText(/Connection works/)).toBeVisible()
    await dialog.getByRole('button', { name: 'Save key' }).click()
    await expect(dialog).toBeHidden()

    const row = keys(page).getByRole('row').filter({ hasText: KEY_NAME })
    await expect(row).toContainText('OpenAI-compatible')
    await expect(page.locator('body')).not.toContainText(KEY_SECRET)
  })

  test('revokes the key', async ({ page }) => {
    await page.goto(`${VAULT}/providers`)
    const row = keys(page).getByRole('row').filter({ hasText: KEY_NAME })
    await row.getByRole('button', { name: `Actions for ${KEY_NAME}` }).click()
    await page.getByRole('menuitem', { name: 'Revoke' }).click()
    await page
      .getByRole('alertdialog', { name: `Revoke ${KEY_NAME}?` })
      .getByRole('button', { name: 'Revoke key' })
      .click()
    await expect(page.getByText(`${KEY_NAME} was revoked`)).toBeVisible()
  })
})
