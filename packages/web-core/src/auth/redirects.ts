// SPDX-License-Identifier: AGPL-3.0-only
/** The query parameter that carries where to go after signing in (`/login?redirect=/acme/agents`). */
export const REDIRECT_PARAM = 'redirect'

// a same-origin path: one leading slash, not followed by another slash or a backslash
const SAME_ORIGIN_PATH = /^\/(?![/\\])/

/**
 * A redirect target from the URL, or `fallback` when it is anything but a same-origin relative
 * path: absolute URLs, protocol-relative `//host` and backslash tricks (`/\host`) are rejected.
 */
export function getSafeRedirect(target: unknown, fallback: string): string {
  return typeof target === 'string' && SAME_ORIGIN_PATH.test(target) ? target : fallback
}
