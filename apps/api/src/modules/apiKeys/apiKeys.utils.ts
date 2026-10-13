// SPDX-License-Identifier: AGPL-3.0-only
import { createHash, randomInt } from 'node:crypto'

import { API_KEY_DISPLAY_PREFIX_LENGTH, API_KEY_PREFIX } from '@surefy/contracts'

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
/** 43 base62 characters carry about 256 bits. */
const RANDOM_LENGTH = 43

export interface GeneratedApiKey {
  /** The full key; shown once, never stored. */
  secret: string
  /** `sk_` plus the first 8 characters of the random part. */
  prefix: string
  /** `sha256` of the full key: what is stored and looked up. */
  hash: Buffer
}

/** `randomInt` draws uniformly, so there is no modulo bias in the base62 characters. */
export function generateApiKey(): GeneratedApiKey {
  const random = Array.from({ length: RANDOM_LENGTH }, () =>
    BASE62.charAt(randomInt(BASE62.length)),
  ).join('')
  const secret = `${API_KEY_PREFIX}${random}`
  return {
    secret,
    prefix: secret.slice(0, API_KEY_DISPLAY_PREFIX_LENGTH),
    hash: hashApiKey(secret),
  }
}

export const hashApiKey = (secret: string): Buffer =>
  createHash('sha256').update(secret, 'utf8').digest()

/** The key row is expired from its date; it stays `active` until someone revokes it. */
export const isExpired = (expiresAt: Date | null, now: Date): boolean =>
  expiresAt !== null && expiresAt.getTime() <= now.getTime()
