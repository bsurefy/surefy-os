// SPDX-License-Identifier: AGPL-3.0-only
import type { Page } from '@playwright/test'

/**
 * Types a message into the chat composer once React has taken over the page. Text typed into the
 * server-rendered box before hydration is thrown away when React attaches, which a slow `next dev`
 * compile makes likely; the box carries React's props once it has hydrated.
 */
export async function typeMessage(page: Page, text: string) {
  const box = page.getByRole('textbox', { name: 'Message' })
  await box.waitFor()
  await box.evaluate(
    (element) =>
      new Promise<void>((resolve) => {
        const check = () => {
          if (Object.keys(element).some((key) => key.startsWith('__reactProps$'))) resolve()
          else requestAnimationFrame(check)
        }
        check()
      }),
  )
  await box.fill(text)
}
