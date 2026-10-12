// SPDX-License-Identifier: AGPL-3.0-only
import { createHash, randomInt } from 'node:crypto'

import { WIDGET_TOKEN_DISPLAY_PREFIX_LENGTH, WIDGET_TOKEN_PREFIX } from '@surefy/contracts'

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
/** 43 base62 characters carry about 256 bits. */
const RANDOM_LENGTH = 43

export interface GeneratedWidgetToken {
  /** The full token; shown once, never stored. */
  secret: string
  /** `wt_` plus the first 8 characters of the random part. */
  prefix: string
  /** `sha256` of the full token: what is stored and looked up. */
  hash: Buffer
}

/**
 * A website widget's token (conventions-and-security.md, §12). It sits in public web pages, so it
 * only names the channel; the allowed origins and the rate limits protect the agent.
 */
export function generateWidgetToken(): GeneratedWidgetToken {
  const random = Array.from({ length: RANDOM_LENGTH }, () =>
    BASE62.charAt(randomInt(BASE62.length)),
  ).join('')
  const secret = `${WIDGET_TOKEN_PREFIX}${random}`
  return {
    secret,
    prefix: secret.slice(0, WIDGET_TOKEN_DISPLAY_PREFIX_LENGTH),
    hash: hashWidgetToken(secret),
  }
}

export const hashWidgetToken = (secret: string): Buffer =>
  createHash('sha256').update(secret, 'utf8').digest()
