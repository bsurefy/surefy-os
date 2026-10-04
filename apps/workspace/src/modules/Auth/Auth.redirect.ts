// SPDX-License-Identifier: AGPL-3.0-only
import { getSafeRedirect } from '@surefy/web-core/auth'

/**
 * A `?redirect=` value that is a same-origin path, or undefined (a list or an outside URL is
 * dropped). Client-side only: it imports the browser entry of `@surefy/web-core/auth`.
 */
export function getRedirectTarget(value: string | string[] | undefined): string | undefined {
  const target = getSafeRedirect(Array.isArray(value) ? value[0] : value, '')
  return target === '' ? undefined : target
}
