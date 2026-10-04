// SPDX-License-Identifier: AGPL-3.0-only
import { randomBytes } from 'node:crypto'

// Crockford base32 (no I, L, O, U), the ULID alphabet.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const TIME_CHARS = 10 // 48 bits
const RANDOM_CHARS = 16 // 80 bits

const encode = (value: bigint, chars: number): string => {
  let out = ''
  let rest = value
  for (let i = 0; i < chars; i += 1) {
    out = ALPHABET.charAt(Number(rest & 31n)) + out
    rest >>= 5n
  }
  return out
}

/** A 26-character ULID: sortable by time, URL-safe, used as the request ID. */
export function ulid(now = Date.now()): string {
  const random = BigInt(`0x${randomBytes(10).toString('hex')}`)
  return encode(BigInt(now), TIME_CHARS) + encode(random, RANDOM_CHARS)
}

export const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/
