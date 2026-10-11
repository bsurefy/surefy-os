// SPDX-License-Identifier: AGPL-3.0-only
import { expect } from '@playwright/test'

import { OWNER, OWNER_STATE } from './env'
import { waitForHydration } from './hydration'

import type { Browser } from '@playwright/test'

/**
 * Signs the Owner in again and keeps that session for the specs that follow. Creating an API key
 * needs a sign-in from the last ten minutes (`AUTH_SESSION_NOT_FRESH`), and the specs that run
 * late in the run find the setup project's session older than that.
 */
export async function refreshOwnerSession(browser: Browser): Promise<void> {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.goto('/login')
    // `next dev` compiles the page on its first visit; typing before it hydrates is lost
    await waitForHydration(page, 'input[type="email"], input[name="email"]')
    await page.getByLabel('Email').fill(OWNER.email)
    await page.getByLabel('Password', { exact: true }).fill(OWNER.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).not.toHaveURL(/\/login/)
    await context.storageState({ path: OWNER_STATE })
  } finally {
    await context.close()
  }
}
