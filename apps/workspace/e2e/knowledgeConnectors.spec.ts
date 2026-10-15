// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test'

import { callApi, currentOrgId } from './support/api'
import { connectorServerUrl, DRIVE_ACCOUNT, NOTION_WORKSPACE, ORGANIZATION } from './support/env'
import { connectStubEmbedding } from './support/models'
import { startWorker, stopWorker } from './support/worker'

import type { Locator, Page } from '@playwright/test'
import type { ChildProcess } from 'node:child_process'

// Google Drive and Notion are the stub server (`connectorServer.ts`): the browser signs in there
// and the worker syncs from there. One knowledge base gets a Drive folder and a Notion page, in
// order: connect, sync, an expired sign-in and Reconnect, then Disconnect.
test.describe.configure({ mode: 'serial' })

const BASE = `Support library ${String(Date.now())}`
const SYNC_TIMEOUT_MS = 90_000

let worker: ChildProcess
let sourcesPath = ''

test.beforeAll(async () => {
  worker = await startWorker()
})
test.afterAll(() => {
  stopWorker(worker)
})

const sources = (page: Page) => page.getByRole('table', { name: 'Sources' })
const rowOf = (page: Page, name: string) => sources(page).getByRole('row').filter({ hasText: name })

/** The connector dialog over the Sources tab; the account dialog opened from it has the same name. */
const connectDialog = (page: Page, app: string) =>
  page.getByRole('dialog', { name: `Connect ${app}` }).first()

/** Asks the stub server to change something, as the app's own side would. */
async function control(method: 'POST' | 'PUT', path: string, body?: unknown) {
  const response = await fetch(`${connectorServerUrl}/control${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  expect(response.ok).toBe(true)
}

/**
 * Asks the base a question in Test search until a passage of `document` has `text` (a sync is a
 * job); the passage names the source it came from.
 */
async function expectSearchFinds(
  page: Page,
  question: string,
  { text, document, source }: { text: string; document: string; source: string },
) {
  await expect(async () => {
    await page.goto(sourcesPath.replace(/\/sources$/, '/test-search'))
    await page.getByRole('textbox', { name: 'Question' }).fill(question)
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    const results = page.getByRole('region', { name: 'Search results' })
    await expect(results).toContainText(text, { timeout: 5_000 })
    await expect(results).toContainText(document)
    await expect(results).toContainText(`From ${source}`)
  }).toPass({ timeout: SYNC_TIMEOUT_MS })
}

/**
 * Waits for the round trip of a sign-in: the app's sign-in page (the stub sends the browser straight
 * back), the callback page, then the Sources tab it was started from.
 */
async function returnFromApp(page: Page, query = '') {
  await page.waitForURL(/\/settings\/connections\/callback\?/, { timeout: 60_000 })
  await page.waitForURL((url) => url.pathname === sourcesPath && url.search.startsWith(query), {
    timeout: 60_000,
  })
}

/** Signs in at the app from the account dialog; the stub allows access and sends the browser back. */
async function signInAt(page: Page, app: string, dialog: Locator) {
  // the sign-in step (step 2) when the app offers more than one way, then who can use it (step 3)
  const next = dialog.getByRole('button', { name: 'Next' })
  const proceed = dialog.getByRole('button', { name: `Continue with ${app}` })
  await expect(next.or(proceed)).toBeVisible()
  if (await next.isVisible()) await next.click()
  await proceed.click()
  await returnFromApp(page, '?connect=')
}

/** Opens a row's action menu and picks an item. */
async function rowAction(page: Page, name: string, item: string) {
  await page.getByRole('button', { name: `Actions for ${name}` }).click()
  await page.getByRole('menuitem', { name: item }).click()
}

test.describe('Knowledge › connectors', () => {
  test('connects Google Drive from the Sources tab and syncs the chosen folder', async ({
    page,
  }) => {
    await page.goto(`/${ORGANIZATION.slug}/knowledge`)
    await connectStubEmbedding(page)
    const orgId = await currentOrgId(page)
    const base = await callApi<{ id: string }>(page, 'POST', `/orgs/${orgId}/knowledge-bases`, {
      name: BASE,
    })
    sourcesPath = `/${ORGANIZATION.slug}/knowledge/${base.id}/sources`
    await page.goto(sourcesPath)

    await page.getByRole('button', { name: 'Connect Google Drive' }).click()
    let dialog = connectDialog(page, 'Google Drive')
    await dialog.getByRole('button', { name: 'Add a Google Drive account' }).click()
    await signInAt(
      page,
      'Google Drive',
      page.getByRole('dialog', { name: 'Connect Google Drive' }).last(),
    )

    // back on the Sources tab, the dialog opens again with the new account picked, named as Google
    // names it
    dialog = connectDialog(page, 'Google Drive')
    await expect(dialog.getByRole('combobox', { name: 'Account' })).toContainText(DRIVE_ACCOUNT)
    await dialog.getByRole('button', { name: 'Open My Drive' }).click()
    await expect(dialog.getByRole('checkbox', { name: /^Finance/ })).toBeVisible()
    await dialog.getByRole('checkbox', { name: /^Handbook/ }).check()
    await dialog.getByRole('button', { name: 'Connect and sync' }).click()
    await expect(page.getByText('Syncing Handbook')).toBeVisible()

    const row = rowOf(page, 'Handbook')
    await expect(row).toContainText('Google Drive · Handbook')
    await expect(row).toContainText('Ready', { timeout: SYNC_TIMEOUT_MS })
    await expect(row).toContainText('Connector')

    // the folder's own file and the one in its subfolder; Finance was not chosen
    await expectSearchFinds(page, 'How long can customers return items?', {
      text: 'within 30 days',
      document: 'returns.md',
      source: 'Handbook',
    })
    await expectSearchFinds(page, 'When do new hires meet their buddy?', {
      text: 'first Monday',
      document: 'first-week.txt',
      source: 'Handbook',
    })
  })

  test('shows the folder as synced, and picks up a changed file on Sync now', async ({ page }) => {
    await page.goto(sourcesPath)
    await page.getByRole('button', { name: 'Add folders Google Drive' }).click()
    const dialog = connectDialog(page, 'Google Drive')
    await dialog.getByRole('button', { name: 'Open My Drive' }).click()
    // the folder this base already syncs is shown, but not picked twice
    const handbook = dialog.getByRole('checkbox', { name: /^Handbook/ })
    await expect(handbook).toBeChecked()
    await expect(handbook).toBeDisabled()
    await expect(dialog.getByText('Already synced here')).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()

    await control('PUT', '/google-drive/files/d-returns', {
      name: 'returns.md',
      mimeType: 'text/markdown',
      parent: 'f-handbook',
      content: '# Returns\n\nCustomers can return items within 45 days of delivery.\n',
    })
    await rowAction(page, 'Handbook', 'Sync now')
    await expect(page.getByText('Syncing Handbook')).toBeVisible()
    await expectSearchFinds(page, 'How long can customers return items?', {
      text: 'within 45 days',
      document: 'returns.md',
      source: 'Handbook',
    })
  })

  test('pauses the source when the Drive sign-in expires, and Reconnect resumes it', async ({
    page,
  }) => {
    // Google ends the sign-in: the next sync is refused and pauses the source
    await control('POST', '/google-drive/expire')
    await page.goto(sourcesPath)
    await rowAction(page, 'Handbook', 'Sync now')

    const row = rowOf(page, 'Handbook')
    await expect(row).toContainText('Paused', { timeout: SYNC_TIMEOUT_MS })
    await expect(row).toContainText('The sign-in expired · Reconnect')
    await expect(page.getByText('The Google Drive sign-in expired')).toBeVisible()
    await expect(
      page.getByText(
        'Syncing 1 source is paused. Its passages stay searchable until you reconnect.',
      ),
    ).toBeVisible()
    // a paused connector offers Reconnect, not Sync now
    await page.getByRole('button', { name: 'Actions for Handbook' }).click()
    await expect(page.getByRole('menuitem', { name: 'Reconnect' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Sync now' })).toHaveCount(0)
    await page.keyboard.press('Escape')

    // the passages stay searchable while it is paused
    await expectSearchFinds(page, 'How long can customers return items?', {
      text: 'within 45 days',
      document: 'returns.md',
      source: 'Handbook',
    })

    await page.goto(sourcesPath)
    await page.getByRole('button', { name: 'Reconnect' }).first().click()
    const reconnect = page.getByRole('dialog', { name: /^Reconnect / })
    await expect(reconnect).toContainText(DRIVE_ACCOUNT)
    await reconnect.getByRole('button', { name: 'Continue with Google Drive' }).click()
    await returnFromApp(page)

    // the worker resumes the paused source and syncs it
    await expect(async () => {
      await page.goto(sourcesPath)
      await expect(rowOf(page, 'Handbook')).toContainText('Ready', { timeout: 5_000 })
    }).toPass({ timeout: SYNC_TIMEOUT_MS })
    await expect(page.getByText('The Google Drive sign-in expired')).toHaveCount(0)
  })

  test('connects Notion and syncs a page with its child pages', async ({ page }) => {
    await page.goto(sourcesPath)
    await page.getByRole('button', { name: 'Connect Notion' }).click()
    let dialog = connectDialog(page, 'Notion')
    await dialog.getByRole('button', { name: 'Add a Notion account' }).click()
    const account = page.getByRole('dialog', { name: 'Connect Notion' }).last()
    // Notion also takes an integration token: sign in instead
    await account.getByRole('radio', { name: 'Sign in' }).click()
    await signInAt(page, 'Notion', account)

    dialog = connectDialog(page, 'Notion')
    await expect(dialog.getByRole('combobox', { name: 'Account' })).toContainText(NOTION_WORKSPACE)
    await expect(dialog.getByText('Child pages are included.')).toBeVisible()
    await dialog.getByRole('checkbox', { name: /^Support wiki/ }).check()
    await dialog.getByRole('button', { name: 'Connect and sync' }).click()

    const row = rowOf(page, 'Support wiki')
    await expect(row).toContainText('Notion · Support wiki')
    await expect(row).toContainText('Ready', { timeout: SYNC_TIMEOUT_MS })
    await expectSearchFinds(page, 'Who approves large refunds?', {
      text: 'support lead',
      document: 'Escalations',
      source: 'Support wiki',
    })
  })

  test('disconnecting an account removes the sources that sync through it', async ({ page }) => {
    for (const [source, account] of [
      ['Handbook', DRIVE_ACCOUNT],
      ['Support wiki', NOTION_WORKSPACE],
    ] as const) {
      await page.goto(`/${ORGANIZATION.slug}/settings/connections`)
      const connection = page.getByRole('row').filter({ hasText: account })
      await connection.getByRole('button', { name: /^Actions for / }).click()
      await page.getByRole('menuitem', { name: 'Disconnect…' }).click()
      const confirm = page.getByRole('alertdialog', { name: /^Disconnect / })
      await expect(confirm).toContainText(`1 knowledge source will stop syncing: ${source}`)
      await confirm.getByRole('button', { name: 'Disconnect', exact: true }).click()
      await expect(page.getByText(/^Disconnected /)).toBeVisible()

      await expect(async () => {
        await page.goto(sourcesPath)
        await expect(page.getByRole('heading', { name: BASE })).toBeVisible()
        await expect(rowOf(page, source)).toHaveCount(0, { timeout: 2_000 })
      }).toPass({ timeout: SYNC_TIMEOUT_MS })
    }
  })
})
