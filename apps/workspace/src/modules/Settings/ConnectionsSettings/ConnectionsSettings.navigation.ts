// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Sends the browser to another site: the app's sign-in page. A function of its own so tests can
 * replace it; the page that comes back is the OAuth return page.
 */
export function goToExternalUrl(url: string): void {
  globalThis.location.assign(url)
}

/**
 * Where an app sends the browser back after sign-in is the same address for every organization
 * (`/settings/connections/callback`, registered at the app); the page there forwards to this one,
 * with what the app added (`code`, `state`, `error`).
 */
export function getOauthReturnPath(
  orgSlug: string,
  search: Readonly<Record<string, string | string[] | undefined>>,
): string {
  const query = new URLSearchParams()
  for (const [name, value] of Object.entries(search)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined) query.append(name, item)
    }
  }
  const path = `/${orgSlug}/settings/connections/callback`
  return query.size === 0 ? path : `${path}?${query.toString()}`
}
