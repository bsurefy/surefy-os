// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test'

import { ORGANIZATION, OWNER } from './support/env'

import type { Page } from '@playwright/test'

const PROFILE = `/${ORGANIZATION.slug}/profile`

async function openProfile(page: Page) {
  await page.goto(PROFILE)
  await expect(page.getByRole('heading', { name: 'Profile', level: 1 })).toBeVisible()
}

test.describe('Profile', () => {
  test('shows the details, the access and the sign-in security of the signed-in person', async ({
    page,
  }) => {
    await openProfile(page)
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue(OWNER.name)
    await expect(page.getByText(OWNER.email)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()

    const access = page.getByRole('region', { name: 'Your access' })
    await expect(access).toContainText(ORGANIZATION.name)
    await expect(access).toContainText('Owner')
    await expect(
      page.getByRole('region', { name: 'Sign-in security' }).getByRole('link', {
        name: 'Set up two-step verification',
      }),
    ).toBeVisible()
  })

  test('saves a new name, and puts the old one back', async ({ page }) => {
    await openProfile(page)
    const name = page.getByRole('textbox', { name: 'Name' })
    await name.fill(`${OWNER.name} Jr`)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Your name was saved')).toBeVisible()

    await page.reload()
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue(`${OWNER.name} Jr`)
    await page.getByRole('textbox', { name: 'Name' }).fill(OWNER.name)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Your name was saved')).toBeVisible()
  })

  test('keeps the theme the person chose', async ({ page }) => {
    await openProfile(page)
    await expect(page.getByRole('radio', { name: 'System' })).toBeChecked()
    await page.getByRole('radio', { name: 'Dark' }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)

    await page.reload()
    await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked()
    await page.getByRole('radio', { name: 'System' }).click()
    await expect(page.getByRole('radio', { name: 'System' })).toBeChecked()
  })

  test('lists the signed-in devices and signs out every other one', async ({ page, browser }) => {
    await openProfile(page)
    const devices = page.getByRole('region', { name: 'Signed-in devices' })
    const list = devices.getByRole('listitem')
    // earlier specs signed in on devices of their own, so count what is there now
    await expect(devices.getByText('This device')).toBeVisible()
    const before = await list.count()

    // a second device: its own browser context, signed in with the same account
    const other = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const otherPage = await other.newPage()
    await otherPage.goto(PROFILE)
    await otherPage.waitForLoadState('networkidle')
    await otherPage.getByLabel('Email').fill(OWNER.email)
    await otherPage.getByLabel('Password', { exact: true }).fill(OWNER.password)
    await otherPage.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(otherPage).toHaveURL(PROFILE)

    await page.reload()
    await expect(list).toHaveCount(before + 1)

    await devices.getByRole('button', { name: 'Sign out everywhere else' }).click()
    await page
      .getByRole('alertdialog', { name: 'Sign out of every other device?' })
      .getByRole('button', { name: 'Sign out everywhere else' })
      .click()
    await expect(page.getByText('Every other device was signed out')).toBeVisible()
    await expect(devices.getByText('Only this device is signed in.')).toBeVisible()
    await expect(list).toHaveCount(1)

    // The other device's cookie is trusted for up to a minute without a lookup (cookieCacheMaxAge),
    // so it is closed here, not waited on.
    await other.close()
  })

  test('offers a personal key only the providers reached at their own address', async ({
    page,
  }) => {
    await openProfile(page)
    const keys = page.getByRole('region', { name: 'API keys' })
    await expect(keys.getByRole('heading', { name: 'No personal keys' })).toBeVisible()

    await keys.getByRole('button', { name: 'Add API key' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Add API key' })
    await expect(dialog.getByText('Just me. Only you can use this key.')).toBeVisible()
    await dialog.getByLabel('Provider').click()
    for (const name of ['OpenAI', 'Anthropic', 'Google']) {
      await expect(page.getByRole('option', { name, exact: true })).toBeVisible()
    }
    // a personal key never takes a custom address, so a provider that needs one is not offered
    await expect(page.getByRole('option', { name: 'OpenAI-compatible' })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(dialog.getByLabel('Base URL')).toHaveCount(0)
  })
})
