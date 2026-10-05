// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test as setup } from '@playwright/test'

import { apiUrl, ORGANIZATION, OWNER, OWNER_STATE } from './support/env'

const HTTP_CREATED = 201

/**
 * The seeded install: first-run setup through the real API (the Owner, the organization and the
 * install administrator), then the Owner signs in through the sign-in screen. The specs reuse the
 * saved session. The setup wizard's own flow is the auth-and-setup spec's job.
 */
setup('set up the install and sign the Owner in', async ({ page, request }) => {
  const response = await request.post(`${apiUrl}/api/v1/setup`, {
    data: { organization: ORGANIZATION, owner: OWNER, locale: 'en' },
  })
  expect(response.status(), await response.text()).toBe(HTTP_CREATED)

  await page.goto('/login')
  await page.getByLabel('Email').fill(OWNER.email)
  await page.getByLabel('Password', { exact: true }).fill(OWNER.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL((url) => url.pathname.startsWith(`/${ORGANIZATION.slug}`))

  await page.context().storageState({ path: OWNER_STATE })
})
