// SPDX-License-Identifier: AGPL-3.0-only
import type { ConnectionSecret } from '@surefy/contracts'

import { REDACTED, SCRUB_MIN_LENGTH } from './agentTools.constants.js'

export type Scrub = (text: string) => string

/**
 * Masks every credential value injected into a call, wherever an app or server echoes it back
 * (an error page, a debug field). Step data, events and logs only ever see scrubbed text.
 */
export function createScrubber(
  secret: ConnectionSecret | null,
  headers: Readonly<Record<string, string>>,
): Scrub {
  const values = new Set<string>()
  const add = (value: string | undefined) => {
    if (value !== undefined && value.length >= SCRUB_MIN_LENGTH) values.add(value)
  }
  if (secret !== null) {
    for (const value of [
      secret.accessToken,
      secret.refreshToken,
      secret.apiKey,
      secret.password,
      secret.token,
      ...Object.values(secret.extra ?? {}),
    ]) {
      add(value)
    }
  }
  for (const value of Object.values(headers)) {
    add(value)
    // `Bearer abc` and `Basic abc` leak as the credential alone
    add(value.split(' ').at(-1))
  }
  const ordered = [...values].sort((a, b) => b.length - a.length)
  return (text) => ordered.reduce((out, value) => out.split(value).join(REDACTED), text)
}

/** `value` as data after scrubbing, or null when it cannot be read back. */
export function scrubData(value: unknown, scrub: Scrub): unknown {
  if (value === null || value === undefined) return null
  try {
    return JSON.parse(scrub(JSON.stringify(value))) as unknown
  } catch {
    return null
  }
}
