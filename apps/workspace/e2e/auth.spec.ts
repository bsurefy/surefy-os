// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test'

import { ORGANIZATION, OWNER } from './support/env'
import { waitForHydration } from './support/hydration'

import type { Page } from '@playwright/test'

const CHAT = `/${ORGANIZATION.slug}/chat`
const PROFILE = `/${ORGANIZATION.slug}/profile`

async function signIn(page: Page, password = OWNER.password) {
  // `next dev` compiles the page on its first visit; typing before it hydrates is lost
  await waitForHydration(page, 'input[type="email"], input[name="email"]')
  await page.getByLabel('Email').fill(OWNER.email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

test.describe('Auth › Setup', () => {
  test('is closed once the install has an organization', async ({ page }) => {
    await page.goto('/setup')
    await expect(
      page.getByRole('heading', { name: 'Setup is already complete', level: 1 }),
    ).toBeVisible()
    await page.getByRole('link', { name: 'Open your workspace' }).click()
    await expect(page).toHaveURL(CHAT)
  })
})

test.describe('Auth › Sign in', () => {
  // Each test signs in on its own, so signing out never ends the session the other specs share.
  test.use({ storageState: { cookies: [], origins: [] } })

  test('sends a signed-out visit to sign-in and back to the page asked for', async ({ page }) => {
    await page.goto(PROFILE)
    await expect(page).toHaveURL(/\/login\?redirect=/)
    await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible()

    await signIn(page)
    await expect(page).toHaveURL(PROFILE)
    await expect(page.getByRole('heading', { name: 'Profile', level: 1 })).toBeVisible()
  })

  test('says so when the password is wrong', async ({ page }) => {
    await page.goto('/login')
    await signIn(page, `${OWNER.password}-wrong`)
    await expect(
      page.getByRole('alert').filter({ hasText: 'The email or password is not right.' }),
    ).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test('signs out from the account menu', async ({ page }) => {
    await page.goto(PROFILE)
    await signIn(page)
    await expect(page).toHaveURL(PROFILE)

    await page.getByRole('button', { name: `Account menu for ${OWNER.name}` }).click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login/)

    await page.goto(PROFILE)
    await expect(page).toHaveURL(/\/login\?redirect=/)
  })
})
