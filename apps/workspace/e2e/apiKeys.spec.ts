// SPDX-License-Identifier: AGPL-3.0-only
import { expect, request as playwrightRequest, test } from '@playwright/test'

import type { ApiKeyCreatedDto } from '@surefy/contracts'

import { callApi, currentOrgId } from './support/api'
import { apiUrl, ORGANIZATION, webUrl } from './support/env'

import type { Page } from '@playwright/test'

const API_KEYS = `/${ORGANIZATION.slug}/settings/api-keys`
const stamp = String(Date.now())
const NAME = `Website backend ${stamp}`
const RENAMED = `Website backend (EU) ${stamp}`
const SCOPED_NAME = `Access reader ${stamp}`

const table = (page: Page) => page.getByRole('table', { name: 'API keys' })
const rowOf = (page: Page, name: string) => table(page).getByRole('row').filter({ hasText: name })

async function openApiKeys(page: Page) {
  await page.goto(API_KEYS)
  await expect(page.getByRole('heading', { name: 'API keys', level: 1 })).toBeVisible()
}

/** What `GET /orgs/:orgId/access/me` answers to a key, at the API's own address or the app's. */
async function callWithKey(secret: string, orgId: string, origin: string = apiUrl) {
  const api = await playwrightRequest.newContext()
  try {
    const response = await api.get(`${origin}/api/v1/orgs/${orgId}/access/me`, {
      headers: { authorization: `Bearer ${secret}` },
    })
    const text = await response.text()
    return { status: response.status(), body: text === '' ? null : (JSON.parse(text) as unknown) }
  } catch {
    // the app answers a request it cannot route with a page, not JSON
    return { status: -1, body: null }
  } finally {
    await api.dispose()
  }
}

// One key is created, used, renamed and revoked across the specs, in order. The first one needs a
// sign-in from the last ten minutes (creating a key asks for it), which the setup project gives.
test.describe.configure({ mode: 'serial' })

let secret = ''
let orgId = ''

test.describe('Settings › API keys', () => {
  test('starts empty', async ({ page }) => {
    await openApiKeys(page)
    await expect(page.getByText('No API keys yet')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create key' }).first()).toBeVisible()
  })

  test('creates a key, shows it once, and lists it without the secret', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await openApiKeys(page)
    orgId = await currentOrgId(page)

    await page.getByRole('button', { name: 'Create key' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Create API key' })
    await dialog.getByRole('textbox', { name: 'Name' }).fill(NAME)
    await dialog.getByRole('checkbox', { name: /Run agents/ }).check()
    await dialog.getByRole('button', { name: 'Create key' }).click()

    // the full key is shown once, in a read-only field
    const created = page.getByRole('dialog', { name: /Your new key/ })
    const field = created.getByRole('textbox', { name: 'API key' })
    secret = await field.inputValue()
    expect(secret).toMatch(/^sk_/)
    await expect(created.getByText(/You won't be able to see this key again/).first()).toBeVisible()
    await expect(created.getByText(/\/agents\/.*\/runs/)).toContainText('Authorization: Bearer sk_')

    // closing without copying asks first
    await created.getByRole('button', { name: 'Done' }).click()
    await expect(created.getByText('Close without copying?')).toBeVisible()
    await created.getByRole('button', { name: 'Keep open' }).click()
    await created.getByRole('button', { name: 'Copy', exact: true }).click()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(secret)
    await created.getByRole('button', { name: 'Done' }).click()
    await expect(created).toBeHidden()

    const row = rowOf(page, NAME)
    await expect(row).toContainText('Run agents')
    await expect(row).toContainText('Active')
    await expect(row).toContainText('Never')
    // the list shows the start of the key, never the key
    await expect(row).not.toContainText(secret)
    await page.reload()
    await expect(rowOf(page, NAME)).not.toContainText(secret)
  })

  test('signs the key in on the API address, inside its permissions only', async ({ page }) => {
    await openApiKeys(page)

    // the key is known: the API answers 403 for what it may not do, not 401
    const outside = await callWithKey(secret, orgId)
    expect(outside.status).toBe(403)
    expect((outside.body as { error: { code: string } }).error.code).toBe('ACCESS_FORBIDDEN')

    // a key with the permission to read its own access sees exactly that, and no role
    const created = await callApi<ApiKeyCreatedDto>(page, 'POST', `/orgs/${orgId}/api-keys`, {
      name: SCOPED_NAME,
      scopes: ['access:read-self'],
    })
    const allowed = await callWithKey(created.secret, orgId)
    expect(allowed.status).toBe(200)
    const access = (allowed.body as { data: { role: string | null; permissions: string[] } }).data
    expect(access.role).toBeNull()
    expect(access.permissions).toEqual(['access:read-self'])

    // a key signs in on the API address only, not through the app's
    expect((await callWithKey(created.secret, orgId, webUrl)).status).toBe(401)
    // and never for another organization
    expect((await callWithKey(created.secret, '00000000-0000-4000-8000-000000000000')).status).toBe(
      404,
    )
    // a made-up key is not a key
    expect((await callWithKey(`sk_${'0'.repeat(48)}`, orgId)).status).toBe(401)

    await callApi(page, 'POST', `/orgs/${orgId}/api-keys/${created.apiKey.id}/revoke`)
  })

  test('shows the key’s details in a drawer', async ({ page }) => {
    await openApiKeys(page)
    await rowOf(page, NAME).getByText(NAME).click()
    const drawer = page.getByRole('dialog', { name: NAME })
    await expect(drawer.getByText(/Starts with sk_/)).toBeVisible()
    await expect(
      drawer.getByText('No agents are published over the API with this key.'),
    ).toBeVisible()
    await expect(drawer.getByRole('button', { name: 'Revoke…' })).toBeVisible()
  })

  test('renames the key', async ({ page }) => {
    await openApiKeys(page)
    await rowOf(page, NAME)
      .getByRole('button', { name: `Actions for ${NAME}` })
      .click()
    await page.getByRole('menuitem', { name: 'Rename' }).click()
    const dialog = page.getByRole('dialog', { name: 'Rename key' })
    await dialog.getByRole('textbox', { name: 'Name' }).fill(RENAMED)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText(`Renamed to ${RENAMED}`)).toBeVisible()
    await expect(rowOf(page, RENAMED)).toContainText('Active')
  })

  test('revokes the key, which stops working at once and stays listed as revoked', async ({
    page,
  }) => {
    await openApiKeys(page)
    await rowOf(page, RENAMED)
      .getByRole('button', { name: `Actions for ${RENAMED}` })
      .click()
    await page.getByRole('menuitem', { name: 'Revoke…' }).click()
    const dialog = page.getByRole('alertdialog', { name: `Revoke ${RENAMED}?` })
    await expect(dialog.getByText(/Nothing uses this key/)).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    expect((await callWithKey(secret, orgId)).status).toBe(403)

    await rowOf(page, RENAMED)
      .getByRole('button', { name: `Actions for ${RENAMED}` })
      .click()
    await page.getByRole('menuitem', { name: 'Revoke…' }).click()
    await page
      .getByRole('alertdialog', { name: `Revoke ${RENAMED}?` })
      .getByRole('button', { name: 'Revoke key' })
      .click()
    await expect(page.getByText(`${RENAMED} was revoked`)).toBeVisible()
    await expect(rowOf(page, RENAMED)).toHaveCount(0)

    // the key no longer signs in, for anything
    expect((await callWithKey(secret, orgId)).status).toBe(401)

    // revoked keys show under their filter
    await page.getByRole('combobox', { name: 'Status' }).click()
    await page.getByRole('option', { name: 'Revoked' }).click()
    await expect(rowOf(page, RENAMED)).toContainText('Revoked')
  })
})
