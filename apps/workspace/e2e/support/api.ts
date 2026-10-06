// SPDX-License-Identifier: AGPL-3.0-only
import type { Page } from '@playwright/test'

/**
 * Calls the API from inside the page, as the app does: same origin through the `/api` rewrite,
 * with the signed-in person's cookies. For arranging data a spec needs from a screen that is not
 * under test.
 */
export async function callApi<T>(
  page: Page,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const result = await page.evaluate(
    async ({ method, path, body }) => {
      const response = await fetch(`/api/v1${path}`, {
        method,
        credentials: 'include',
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? null : JSON.stringify(body),
      })
      return { status: response.status, text: await response.text() }
    },
    { method, path, body },
  )
  if (result.status >= 400)
    throw new Error(`${method} ${path}: ${String(result.status)} ${result.text}`)
  return (JSON.parse(result.text) as { data: T }).data
}

/** The signed-in person's first organization id. */
export async function currentOrgId(page: Page): Promise<string> {
  const me = await callApi<{ memberships: { organization: { id: string } }[] }>(page, 'GET', '/me')
  const [membership] = me.memberships
  if (!membership) throw new Error('The signed-in person belongs to no organization')
  return membership.organization.id
}
