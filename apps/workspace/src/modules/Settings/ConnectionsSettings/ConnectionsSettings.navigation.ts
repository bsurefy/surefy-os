// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Sends the browser to another site: the app's sign-in page. A function of its own so tests can
 * replace it; the page that comes back is the OAuth return page.
 */
export function goToExternalUrl(url: string): void {
  globalThis.location.assign(url)
}
