// SPDX-License-Identifier: AGPL-3.0-only
import { createHmac, timingSafeEqual } from 'node:crypto'

import { SLACK_SIGNATURE_MAX_AGE_SECONDS } from '@surefy/contracts'
import type { AgentChannelConfig } from '@surefy/contracts'

import {
  SLACK_MESSAGE_MAX_LENGTH,
  WHATSAPP_MESSAGE_MAX_LENGTH,
} from './agentPublishing.constants.js'

import type { HttpResult, OutboundHttp } from '@/modules/connections/index.js'

// The wire formats of Slack and WhatsApp: checking their signatures, reading their events and
// sending a reply. No database and no runs here; the channels decide what an event means.

const SLACK_POST_MESSAGE_URL = 'https://slack.com/api/chat.postMessage'
const GRAPH_URL = 'https://graph.facebook.com/v21.0'
const SEND_TIMEOUT_MS = 10_000

const safeEqual = (left: string, right: string): boolean => {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

const objectOf = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const stringOf = (value: unknown): string | null => (typeof value === 'string' ? value : null)

const arrayOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

export const parseBody = (body: Buffer): Record<string, unknown> => {
  try {
    return objectOf(JSON.parse(body.toString('utf8')))
  } catch {
    return {}
  }
}

/** A reply that did not arrive, and whether the connection itself was refused. */
export class ReplyFailedError extends Error {
  constructor(
    readonly code: string,
    /** The app refused the credentials: the channel goes to `error`. */
    readonly rejected: boolean,
  ) {
    super(code)
    this.name = 'ReplyFailedError'
  }
}

/** Long answers are cut at a paragraph or a line where possible. */
export function splitText(text: string, max: number): string[] {
  const parts: string[] = []
  let rest = text.trim()
  while (rest.length > max) {
    const window = rest.slice(0, max)
    const cut = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('\n'))
    const at = cut > max / 2 ? cut : max
    parts.push(rest.slice(0, at).trimEnd())
    rest = rest.slice(at).trimStart()
  }
  if (rest !== '') parts.push(rest)
  return parts
}

// ── Slack ───────────────────────────────────────────────────────────────────────────────────────

/**
 * `v0=` and the HMAC-SHA256 of `v0:{timestamp}:{body}` with the Slack app's signing secret, no
 * older than SLACK_SIGNATURE_MAX_AGE_SECONDS.
 */
export function isSlackSignatureValid(input: {
  secret: string | undefined
  body: Buffer
  signature: string | undefined
  timestamp: string | undefined
  now: Date
}): boolean {
  const { secret, body, signature, timestamp } = input
  if (secret === undefined || signature === undefined || timestamp === undefined) return false
  const seconds = Number(timestamp)
  if (!Number.isInteger(seconds)) return false
  if (Math.abs(input.now.getTime() / 1000 - seconds) > SLACK_SIGNATURE_MAX_AGE_SECONDS) return false
  const expected =
    'v0=' + createHmac('sha256', secret).update(`v0:${timestamp}:`).update(body).digest('hex')
  return safeEqual(expected, signature)
}

/** A Slack message the agent may answer: a mention in a channel, or a direct message. */
export interface SlackMessage {
  eventId: string
  /** `{team_id}/{bot_user_id}`: the channel's account. */
  account: string
  kind: 'mention' | 'direct'
  channel: string
  /** The thread the answer goes to: the message's own thread, or the message itself. */
  thread: string
  text: string
}

export type SlackEnvelope =
  | { kind: 'url_verification'; challenge: string }
  | { kind: 'message'; message: SlackMessage }
  | { kind: 'other' }

const MENTION = /<@[\dA-Z]+>/g

/** Reads an Events API body: the set-up check, a message for the agent, or anything else. */
export function readSlackEnvelope(payload: Record<string, unknown>): SlackEnvelope {
  if (payload.type === 'url_verification') {
    return { kind: 'url_verification', challenge: stringOf(payload.challenge) ?? '' }
  }
  if (payload.type !== 'event_callback') return { kind: 'other' }
  const event = objectOf(payload.event)
  const team = stringOf(payload.team_id)
  const bot = stringOf(objectOf(arrayOf(payload.authorizations)[0]).user_id)
  const eventId = stringOf(payload.event_id)
  const channel = stringOf(event.channel)
  const ts = stringOf(event.ts)
  if (team === null || bot === null || eventId === null || channel === null || ts === null) {
    return { kind: 'other' }
  }
  // the agent's own messages, other bots and edits never start a run
  if (event.bot_id !== undefined || event.subtype !== undefined || event.user === bot) {
    return { kind: 'other' }
  }
  let kind: SlackMessage['kind'] | null = null
  if (event.type === 'app_mention') kind = 'mention'
  else if (event.type === 'message' && event.channel_type === 'im') kind = 'direct'
  if (kind === null) return { kind: 'other' }
  return {
    kind: 'message',
    message: {
      eventId,
      account: `${team}/${bot}`,
      kind,
      channel,
      thread: stringOf(event.thread_ts) ?? ts,
      text: (stringOf(event.text) ?? '').replaceAll(MENTION, '').trim(),
    },
  }
}

/** The channel's settings: mentions in its listed channels (all when none are listed), or direct messages. */
export function slackAccepts(config: AgentChannelConfig, message: SlackMessage): boolean {
  const settings = config.slack
  const respondTo = settings?.respondTo ?? 'mentions'
  if (respondTo === 'direct_messages') return message.kind === 'direct'
  if (message.kind !== 'mention') return false
  const listed = settings?.channelIds ?? []
  return (
    listed.length === 0 || listed.some((id) => id.toLowerCase() === message.channel.toLowerCase())
  )
}

const SLACK_REJECTED = new Set([
  'invalid_auth',
  'token_revoked',
  'token_expired',
  'account_inactive',
  'not_authed',
])

/** Posts the answer in the thread, in parts when it is long. */
export async function sendSlackReply(
  http: OutboundHttp,
  input: { token: string; channel: string; thread: string; text: string },
): Promise<void> {
  for (const part of splitText(input.text, SLACK_MESSAGE_MAX_LENGTH)) {
    const result = await http.provider(SLACK_POST_MESSAGE_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${input.token}`,
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        channel: input.channel,
        thread_ts: input.thread,
        text: part,
        unfurl_links: false,
      }),
      timeoutMs: SEND_TIMEOUT_MS,
    })
    const body = objectOf(safeJson(result))
    if (result.status >= 400 || body.ok !== true) {
      const code = stringOf(body.error) ?? `HTTP_${String(result.status)}`
      throw new ReplyFailedError(code, SLACK_REJECTED.has(code) || result.status === 401)
    }
  }
}

// ── WhatsApp ────────────────────────────────────────────────────────────────────────────────────

/** `sha256=` and the HMAC-SHA256 of the body with the Meta app's secret. */
export function isWhatsappSignatureValid(input: {
  secret: string | undefined
  body: Buffer
  signature: string | undefined
}): boolean {
  const { secret, body, signature } = input
  if (secret === undefined || secret === '' || signature === undefined) return false
  const expected = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
  return safeEqual(expected, signature)
}

/** A text message a person sent to the business number. */
export interface WhatsappMessage {
  eventId: string
  /** The phone number id of the business number: the channel's account. */
  account: string
  /** The sender's WhatsApp id: the chat, and where the answer goes. */
  from: string
  text: string
}

/** The text messages of a webhook body; statuses, reactions and media are left out. */
export function readWhatsappMessages(payload: Record<string, unknown>): WhatsappMessage[] {
  if (payload.object !== 'whatsapp_business_account') return []
  const messages: WhatsappMessage[] = []
  for (const entry of arrayOf(payload.entry)) {
    for (const change of arrayOf(objectOf(entry).changes)) {
      const value = objectOf(objectOf(change).value)
      const account = stringOf(objectOf(value.metadata).phone_number_id)
      if (account === null) continue
      for (const raw of arrayOf(value.messages)) {
        const message = objectOf(raw)
        const id = stringOf(message.id)
        const from = stringOf(message.from)
        const text = stringOf(objectOf(message.text).body)
        if (message.type !== 'text' || id === null || from === null || text === null) continue
        messages.push({ eventId: id, account, from, text })
      }
    }
  }
  return messages
}

/** Sends a text from the business number, in parts when it is long. */
export async function sendWhatsappMessage(
  http: OutboundHttp,
  input: { token: string; phoneNumberId: string; to: string; text: string },
): Promise<void> {
  for (const part of splitText(input.text, WHATSAPP_MESSAGE_MAX_LENGTH)) {
    const result = await http.provider(
      `${GRAPH_URL}/${encodeURIComponent(input.phoneNumberId)}/messages`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${input.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: input.to,
          type: 'text',
          text: { body: part, preview_url: false },
        }),
        timeoutMs: SEND_TIMEOUT_MS,
      },
    )
    if (result.status >= 400) {
      const error = objectOf(objectOf(safeJson(result)).error)
      const code =
        typeof error.code === 'number'
          ? `META_${String(error.code)}`
          : `HTTP_${String(result.status)}`
      // 190: the access token expired or was revoked
      throw new ReplyFailedError(code, result.status === 401 || error.code === 190)
    }
  }
}

function safeJson(result: Pick<HttpResult, 'text'>): unknown {
  try {
    return JSON.parse(result.text)
  } catch {
    return null
  }
}
