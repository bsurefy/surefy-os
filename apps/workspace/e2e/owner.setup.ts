// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test as setup } from '@playwright/test'

import type { SetupStatusDto } from '@surefy/contracts'

import { apiUrl, ORGANIZATION, OWNER, OWNER_STATE } from './support/env'

/**
 * First run on a fresh install, through the setup wizard: the server check, the organization and
 * its Owner (the install's first account, signed in on creation), the AI model step skipped, and
 * "Open Chat" finishes setup and lands on Chat. The specs reuse the Owner's session.
 */
setup('sets up the install through the wizard and opens Chat', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL('/setup')

  await expect(page.getByRole('heading', { name: 'Welcome to SurefyOS', level: 1 })).toBeVisible()
  const checks = page.getByRole('list', { name: 'Server checks' })
  await expect(checks.getByRole('listitem').filter({ hasText: 'Database' })).toContainText('Ready')
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(
    page.getByRole('heading', { name: 'Your organization and owner', level: 1 }),
  ).toBeVisible()
  await expect(page.getByRole('progressbar', { name: 'Organization and owner' })).toHaveAttribute(
    'aria-valuetext',
    'Step 2 of 4',
  )
  await page.getByLabel('Organization name').fill(ORGANIZATION.name)
  await page.getByLabel('URL address').fill(ORGANIZATION.slug)
  await expect(page.getByText('This address is available.')).toBeVisible()
  await page.getByLabel('Your name').fill(OWNER.name)
  await page.getByLabel('Work email').fill(OWNER.email)
  await page.getByLabel('Password', { exact: true }).fill(OWNER.password)
  await page.getByRole('button', { name: 'Create organization' }).click()

  await expect(page.getByRole('heading', { name: 'Connect an AI model', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'Skip for now' }).click()

  await expect(page.getByRole('heading', { name: "You're ready", level: 1 })).toBeVisible()
  const summary = page.getByLabel('Summary')
  await expect(summary).toContainText(`${ORGANIZATION.name} · ${ORGANIZATION.slug}`)
  await expect(summary).toContainText('Not connected yet')
  await page.getByRole('button', { name: 'Open Chat' }).click()

  // the chat screen itself, with its "Connect a model" state and the checklist, is the chat spec's
  await page.waitForURL(`/${ORGANIZATION.slug}/chat`)
  const status = await page.request.get(`${apiUrl}/api/v1/setup/status`)
  expect(((await status.json()) as { data: SetupStatusDto }).data.finishedAt).not.toBeNull()

  await page.context().storageState({ path: OWNER_STATE })
})
