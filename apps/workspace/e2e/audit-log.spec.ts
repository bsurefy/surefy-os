// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test'

import { callApi, currentOrgId } from './support/api'
import { ORGANIZATION, OWNER } from './support/env'

const AUDIT_LOG = `/${ORGANIZATION.slug}/guard/audit-log`

test.describe('Guard › Audit log', () => {
  test('is in the navigation and lists what setup recorded', async ({ page }) => {
    await page.goto(`/${ORGANIZATION.slug}`)
    await page.getByRole('navigation').getByRole('link', { name: /Guard/ }).click()
    await expect(page).toHaveURL(AUDIT_LOG)
    await expect(page.getByRole('heading', { name: 'Audit log', level: 1 })).toBeVisible()

    const table = page.getByRole('table', { name: 'Audit log' })
    await expect(table.getByRole('row').nth(1)).toBeVisible()
    await expect(table).toContainText(OWNER.name)
    await expect(
      page.getByRole('status').filter({ hasText: /verified|Not verified/ }),
    ).toBeVisible()
  })

  test('records a change as it happens, and filters by event type', async ({ page }) => {
    await page.goto(AUDIT_LOG)
    const orgId = await currentOrgId(page)
    const teamName = `Support ${String(Date.now())}`
    await callApi(page, 'POST', `/orgs/${orgId}/teams`, { name: teamName })

    await page.reload()
    const table = page.getByRole('table', { name: 'Audit log' })
    const row = table.getByRole('row').filter({ hasText: teamName })
    await expect(row).toContainText('Team created')
    await expect(row).toContainText('Success')

    await page.getByRole('combobox', { name: 'Event type' }).click()
    await page.getByRole('option', { name: 'Team created' }).click()
    await expect(page).toHaveURL(/action=team\.created/)
    await expect(table.getByRole('row')).toHaveCount(2)
    await expect(row).toBeVisible()
  })

  test('opens an entry with its request and its place in the chain', async ({ page }) => {
    await page.goto(AUDIT_LOG)
    const table = page.getByRole('table', { name: 'Audit log' })
    await table.getByRole('row').nth(1).getByRole('link').click()
    await expect(page).toHaveURL(/entry=/)

    const panel = page.getByRole('dialog')
    await expect(panel.getByText('Entry ID')).toBeVisible()
    await expect(panel.getByText('Request ID')).toBeVisible()
    // an entry is signed when it joins the chain, within about a minute of being written
    await expect(panel.getByText(/Sealing…|Chained to the previous entry/)).toBeVisible()
    await expect(panel.getByText('"version": 1')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()
    await expect(page).not.toHaveURL(/entry=/)
  })

  test('starts a verification of the chain', async ({ page }) => {
    await page.goto(AUDIT_LOG)
    await page.getByRole('button', { name: 'Verify now' }).click()
    await expect(page.getByText('Verification started')).toBeVisible()
  })

  test('shows the Enterprise card for export on Community', async ({ page }) => {
    await page.goto(AUDIT_LOG)
    await page.getByRole('button', { name: 'Export' }).click()
    const dialog = page.getByRole('dialog', { name: 'Export audit log' })
    await expect(dialog.getByText(/Audit export is part of SurefyOS/)).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Start export' })).toHaveCount(0)
  })
})
