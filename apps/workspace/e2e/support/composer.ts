// SPDX-License-Identifier: AGPL-3.0-only
import { waitForHydration } from './hydration'

import type { Page } from '@playwright/test'

/** Types a message into the chat composer once it has hydrated. */
export async function typeMessage(page: Page, text: string) {
  await waitForHydration(page, 'textarea[aria-label="Message"]')
  await page.getByRole('textbox', { name: 'Message' }).fill(text)
}
