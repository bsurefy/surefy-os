// SPDX-License-Identifier: AGPL-3.0-only
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

import {
  WHATSAPP_VERIFY_TOKEN_PREFIX,
  WIDGET_TOKEN_DISPLAY_PREFIX_LENGTH,
  WIDGET_TOKEN_PREFIX,
} from '@surefy/contracts'

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

/**
 * A widget channel that waits for an approval, or was approved after a Builder's request, holds
 * the hash of a token nobody has: nothing resolves until someone issues the real one.
 */
export const unissuedWidgetToken = (): { hash: Buffer; prefix: null } => ({
  hash: createHash('sha256').update(randomBytes(32)).digest(),
  prefix: null,
})

const VERIFY_MAC_LENGTH = 22
const VERIFY_TOKEN = /^wv_([0-9a-f]{32})([\w-]{22})$/

const verifyMac = (key: string, id: string): string =>
  createHmac('sha256', key)
    .update(`whatsapp-verify-token:${id}`)
    .digest('base64url')
    .slice(0, VERIFY_MAC_LENGTH)

/**
 * The token Meta's webhook set-up sends back for a WhatsApp channel: `wv_`, the channel id and a
 * keyed hash of it, so the set-up check needs no lookup. It only proves that the address belongs
 * to this install; the events themselves are signed with the app secret.
 */
export function whatsappVerifyToken(key: string, channelId: string): string {
  const id = channelId.replaceAll('-', '').toLowerCase()
  return `${WHATSAPP_VERIFY_TOKEN_PREFIX}${id}${verifyMac(key, id)}`
}

export function isWhatsappVerifyToken(key: string, token: string): boolean {
  const match = VERIFY_TOKEN.exec(token)
  const id = match?.[1]
  const mac = match?.[2]
  if (id === undefined || mac === undefined) return false
  return timingSafeEqual(Buffer.from(verifyMac(key, id)), Buffer.from(mac))
}
