// SPDX-License-Identifier: AGPL-3.0-only
import { randomBytes } from 'node:crypto'

/**
 * A UUID version 7 (RFC 9562): 48-bit Unix milliseconds, then random bits, like Postgres 18's
 * `uuidv7()`. For rows whose id must be known before the insert (an audit entry hashes its id).
 */
export function uuidv7(now = Date.now()): string {
  const bytes = randomBytes(16)
  bytes.writeUIntBE(now, 0, 6)
  bytes[6] = 0x70 | ((bytes[6] ?? 0) & 0x0f) // version 7
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f) // variant 10
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
