// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from '@playwright/test'

import { callApi } from './support/api'
import { ORGANIZATION } from './support/env'
import { clearNotifications, seedNotifications } from './support/notifications'

import type { Page } from '@playwright/test'

const NOTIFICATIONS = `/${ORGANIZATION.slug}/notifications`

async function whoAmI(page: Page) {
  const me = await callApi<{
    user: { id: string }
    memberships: { organization: { id: string } }[]
  }>(page, 'GET', '/me')
  return { userId: me.user.id, orgId: me.memberships[0]?.organization.id ?? '' }
}

const bell = (page: Page, label: string | RegExp) => page.getByRole('button', { name: label })
const items = (page: Page) =>
  page.getByRole('list', { name: 'Notifications' }).getByRole('listitem')

// The specs share one person's notifications: the first finds none, the rest seed and read them.
test.describe.configure({ mode: 'serial' })

test.describe('Notifications', () => {
  test('says so when nothing has happened yet', async ({ page }) => {
    // earlier specs may have had a job tell the person something (a source that is ready)
    await page.goto(`/${ORGANIZATION.slug}/profile`)
    const { orgId, userId } = await whoAmI(page)
    clearNotifications(orgId, userId)

    await page.goto(NOTIFICATIONS)
    await expect(page.getByRole('heading', { name: 'Notifications', level: 1 })).toBeVisible()
    await expect(page.getByRole('heading', { name: "You're all caught up" })).toBeVisible()
    await expect(bell(page, 'Notifications')).toBeVisible()
  })

  test('counts what is unread on the bell and lists it in the popover', async ({ page }) => {
    await page.goto(`/${ORGANIZATION.slug}/profile`)
    const { orgId, userId } = await whoAmI(page)
    seedNotifications(orgId, userId, [
      'export.ready',
      'knowledge_source.failed',
      'vault_key.expiring',
    ])

    await page.reload()
    await bell(page, 'Notifications, 3 unread').click()
    const popover = page.getByRole('dialog')
    await expect(popover.getByText('Your data export is ready to download')).toBeVisible()
    await expect(popover.getByText("A knowledge source couldn't be processed")).toBeVisible()
    await popover.getByRole('link', { name: 'See all notifications' }).click()
    await expect(page).toHaveURL(NOTIFICATIONS)
    await expect(items(page)).toHaveCount(3)
  })

  test('marks one as read, and filters to what is still unread', async ({ page }) => {
    await page.goto(NOTIFICATIONS)
    await expect(items(page)).toHaveCount(3)
    await items(page).first().getByRole('button', { name: 'Mark as read' }).click()
    await expect(bell(page, 'Notifications, 2 unread')).toBeVisible()

    await page.getByRole('radio', { name: 'Unread' }).click()
    await expect(page).toHaveURL(/show=unread/)
    await expect(items(page)).toHaveCount(2)
    await page.getByRole('radio', { name: 'All' }).click()
    await expect(items(page)).toHaveCount(3)
  })

  test('marks everything as read', async ({ page }) => {
    await page.goto(NOTIFICATIONS)
    await page.getByRole('button', { name: 'Mark all as read' }).click()
    await expect(bell(page, 'Notifications')).toBeVisible()

    await page.getByRole('radio', { name: 'Unread' }).click()
    await expect(page.getByRole('heading', { name: 'No unread notifications' })).toBeVisible()
    await page.getByRole('button', { name: 'Show all' }).click()
    await expect(items(page)).toHaveCount(3)
  })
})
