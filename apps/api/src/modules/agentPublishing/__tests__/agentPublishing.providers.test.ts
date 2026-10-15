// SPDX-License-Identifier: AGPL-3.0-only
import { createHmac } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { createFakeHttp } from '../../../../test/fixtures/fakeHttp.js'
import {
  isSlackSignatureValid,
  isWhatsappSignatureValid,
  readSlackEnvelope,
  readWhatsappMessages,
  sendSlackReply,
  sendWhatsappMessage,
  slackAccepts,
  splitText,
} from '../agentPublishing.providers.js'
import { FAILED_REPLY, replyTargetOf, replyText } from '../agentPublishing.replies.js'
import { isWhatsappVerifyToken, whatsappVerifyToken } from '../agentPublishing.tokens.js'

const NOW = new Date('2026-10-12T10:00:00.000Z')
const SECONDS = String(Math.floor(NOW.getTime() / 1000))

const slackSign = (body: string, timestamp = SECONDS, secret = 'secret') =>
  'v0=' + createHmac('sha256', secret).update(`v0:${timestamp}:${body}`).digest('hex')

describe('Slack signatures', () => {
  const body = '{"type":"event_callback"}'
  const check = (overrides: Partial<Parameters<typeof isSlackSignatureValid>[0]>) =>
    isSlackSignatureValid({
      secret: 'secret',
      body: Buffer.from(body),
      signature: slackSign(body),
      timestamp: SECONDS,
      now: NOW,
      ...overrides,
    })

  it('accepts the v0 signature of a recent request', () => {
    expect(check({})).toBe(true)
  })

  it('refuses another secret, another body, an old request and a missing secret', () => {
    expect(check({ signature: slackSign(body, SECONDS, 'other') })).toBe(false)
    expect(check({ body: Buffer.from('{}') })).toBe(false)
    const old = String(Number(SECONDS) - 301)
    expect(check({ timestamp: old, signature: slackSign(body, old) })).toBe(false)
    expect(check({ secret: undefined })).toBe(false)
    expect(check({ signature: 'v0=short' })).toBe(false)
  })
})

describe('Slack events', () => {
  const base = {
    type: 'event_callback',
    team_id: 'T1',
    event_id: 'Ev1',
    authorizations: [{ user_id: 'U0BOT' }],
  }

  it('reads a mention without the mention itself, in its thread', () => {
    const envelope = readSlackEnvelope({
      ...base,
      event: {
        type: 'app_mention',
        user: 'U1',
        text: '<@U0BOT> where is <@U2>’s order?',
        channel: 'C1',
        ts: '1.1',
        thread_ts: '1.0',
      },
    })
    expect(envelope).toEqual({
      kind: 'message',
      message: {
        eventId: 'Ev1',
        account: 'T1/U0BOT',
        kind: 'mention',
        channel: 'C1',
        thread: '1.0',
        text: 'where is ’s order?',
      },
    })
  })

  it('leaves out the bot’s own messages, other bots, edits and channel messages', () => {
    const event = { user: 'U1', text: 'x', channel: 'C1', ts: '1.1' }
    for (const extra of [
      { type: 'app_mention', user: 'U0BOT' },
      { type: 'app_mention', bot_id: 'B1' },
      { type: 'message', channel_type: 'im', subtype: 'message_changed' },
      { type: 'message', channel_type: 'channel' },
    ]) {
      expect(readSlackEnvelope({ ...base, event: { ...event, ...extra } }).kind).toBe('other')
    }
    expect(readSlackEnvelope({ type: 'url_verification', challenge: 'c' })).toEqual({
      kind: 'url_verification',
      challenge: 'c',
    })
  })

  it('answers mentions in the listed channels, or direct messages', () => {
    const mention = {
      eventId: 'E',
      account: 'a',
      kind: 'mention' as const,
      channel: 'C1',
      thread: '1',
      text: 'x',
    }
    const direct = { ...mention, kind: 'direct' as const }
    const settings = (channelIds: string[], respondTo: 'mentions' | 'direct_messages') => ({
      version: 1 as const,
      slack: { channelIds, respondTo },
    })
    expect(slackAccepts(settings([], 'mentions'), mention)).toBe(true)
    expect(slackAccepts(settings(['C2'], 'mentions'), mention)).toBe(false)
    expect(slackAccepts(settings(['c1'], 'mentions'), mention)).toBe(true)
    expect(slackAccepts(settings([], 'mentions'), direct)).toBe(false)
    expect(slackAccepts(settings([], 'direct_messages'), direct)).toBe(true)
    expect(slackAccepts(settings([], 'direct_messages'), mention)).toBe(false)
  })
})

describe('WhatsApp', () => {
  it('checks the app secret’s signature', () => {
    const body = Buffer.from('{"object":"whatsapp_business_account"}')
    const signature = 'sha256=' + createHmac('sha256', 'app').update(body).digest('hex')
    expect(isWhatsappSignatureValid({ secret: 'app', body, signature })).toBe(true)
    expect(isWhatsappSignatureValid({ secret: 'other', body, signature })).toBe(false)
    expect(isWhatsappSignatureValid({ secret: undefined, body, signature })).toBe(false)
  })

  it('reads the text messages and leaves statuses and media out', () => {
    const messages = readWhatsappMessages({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: '1055' },
                messages: [
                  { id: 'm1', from: '49151', type: 'text', text: { body: 'Hello' } },
                  { id: 'm2', from: '49151', type: 'image', image: {} },
                ],
                statuses: [{ id: 'm0', status: 'read' }],
              },
            },
          ],
        },
      ],
    })
    expect(messages).toEqual([{ eventId: 'm1', account: '1055', from: '49151', text: 'Hello' }])
    expect(readWhatsappMessages({ object: 'page' })).toEqual([])
  })

  it('verifies the set-up token of a channel without a lookup', () => {
    const token = whatsappVerifyToken('key', '0198f2c0-0000-7000-8000-000000000001')
    expect(token).toMatch(/^wv_0198f2c0000070008000000000000001[\w-]{22}$/)
    expect(isWhatsappVerifyToken('key', token)).toBe(true)
    expect(isWhatsappVerifyToken('other key', token)).toBe(false)
    expect(isWhatsappVerifyToken('key', 'wv_short')).toBe(false)
  })
})

describe('replies', () => {
  it('cut long answers at a line where possible', () => {
    expect(splitText('short', 10)).toEqual(['short'])
    expect(splitText('first line\nsecond line', 15)).toEqual(['first line', 'second line'])
    expect(splitText('a'.repeat(25), 10)).toEqual(['a'.repeat(10), 'a'.repeat(10), 'a'.repeat(5)])
  })

  it('read where the answer goes from the run', () => {
    expect(replyTargetOf('slack:C42:1700000000.000100')).toEqual({
      type: 'slack',
      channel: 'C42',
      thread: '1700000000.000100',
      conversation: 'C42:1700000000.000100',
    })
    expect(replyTargetOf('whatsapp:49151')).toEqual({
      type: 'whatsapp',
      to: '49151',
      conversation: '49151',
    })
    expect(replyTargetOf(null)).toBeNull()
    expect(replyTargetOf('api:x')).toBeNull()
  })

  it('list the sources under the answer', () => {
    expect(
      replyText({
        text: 'Refunds take 5 days.',
        sources: [
          { title: 'Refund policy', documentId: null, page: 3 },
          { title: 'FAQ', documentId: null, page: null },
        ],
      }),
    ).toBe('Refunds take 5 days.\n\nSources:\n1. Refund policy (p. 3)\n2. FAQ')
    expect(replyText(null)).toBe(FAILED_REPLY)
  })
})

describe('replies to a stub server', () => {
  const STUB = 'http://127.0.0.1:4029'

  it('post to the stub as a local host, and to the app itself without one', async () => {
    const http = createFakeHttp()
    http.on('/api/chat.postMessage', { body: { ok: true } })
    http.on('/messages', { body: { messages: [{ id: 'm' }] } })
    const slack = { token: 't', channel: 'C1', thread: '1.1', text: 'Hi' }
    const whatsapp = { token: 't', phoneNumberId: '123456', to: '4915', text: 'Hi' }

    await sendSlackReply(http, slack, STUB)
    await sendSlackReply(http, slack)
    await sendWhatsappMessage(http, whatsapp, STUB)
    await sendWhatsappMessage(http, whatsapp)

    expect(http.calls.map(({ kind, url }) => [kind, url])).toEqual([
      ['external', `${STUB}/api/chat.postMessage`],
      ['provider', 'https://slack.com/api/chat.postMessage'],
      ['external', `${STUB}/v21.0/123456/messages`],
      ['provider', 'https://graph.facebook.com/v21.0/123456/messages'],
    ])
  })
})
