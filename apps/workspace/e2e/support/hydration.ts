// SPDX-License-Identifier: AGPL-3.0-only
import type { Page } from '@playwright/test'

/**
 * Waits until React has taken over the element a selector names. Text typed or a click made on the
 * server-rendered page before that is thrown away, which a slow first compile under `next dev`
 * makes likely. The element carries React's props once it has hydrated; it is looked up on every
 * check, since React may replace the server-rendered node.
 */
export async function waitForHydration(page: Page, selector: string) {
  await page.waitForFunction((target) => {
    const element = document.querySelector(target)
    return element !== null && Object.keys(element).some((key) => key.startsWith('__reactProps$'))
  }, selector)
}
