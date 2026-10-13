// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  AGENTS_ERROR_CODES,
  ERROR_CODES,
  sendWidgetMessageInputSchema,
  WIDGET_MESSAGES_MAX,
  WIDGET_STREAM_EVENTS,
  WIDGET_TOKEN_DISPLAY_PREFIX_LENGTH,
  widgetConfigDtoSchema,
  widgetStreamEventSchemas,
  widgetTokenSchema,
} from '../index.js'

const conversationId = '0190a5c4-0000-7000-8000-000000000001'
const token = `wt_${'a1B2c3D4e5'.repeat(4)}xyz`

describe('widget endpoint', () => {
  it('accepts only well-formed tokens', () => {
    expect(widgetTokenSchema.safeParse(token).success).toBe(true)
    expect(widgetTokenSchema.safeParse(`sk_${token.slice(3)}`).success).toBe(false)
    expect(widgetTokenSchema.safeParse(token.slice(0, -1)).success).toBe(false)
    expect(token.slice(0, WIDGET_TOKEN_DISPLAY_PREFIX_LENGTH)).toBe('wt_a1B2c3D4')
  })

  it('describes the panel', () => {
    expect(
      widgetConfigDtoSchema.safeParse({
        agentName: 'Support triage',
        greeting: '',
        conversationStarters: ['Where is my order?'],
        theme: 'auto',
        position: 'bottom_right',
        locale: 'en',
        messageMaxLength: 4000,
      }).success,
    ).toBe(true)
  })

  it('sends the conversation so far, the visitor last', () => {
    const user = { role: 'user', text: 'Where is my order?' }
    const assistant = { role: 'assistant', text: 'Which order number?' }
    expect(
      sendWidgetMessageInputSchema.safeParse({ conversationId, messages: [user, assistant, user] })
        .success,
    ).toBe(true)
    expect(
      sendWidgetMessageInputSchema.safeParse({ conversationId, messages: [user, assistant] })
        .success,
    ).toBe(false)
    expect(
      sendWidgetMessageInputSchema.safeParse({
        conversationId,
        messages: Array.from({ length: WIDGET_MESSAGES_MAX + 1 }, () => user),
      }).success,
    ).toBe(false)
  })

  it('has one schema per stream event', () => {
    expect(Object.keys(widgetStreamEventSchemas)).toEqual([...WIDGET_STREAM_EVENTS])
    expect(
      widgetStreamEventSchemas.source.safeParse({
        index: 1,
        title: 'Refund policy',
        page: 3,
        url: null,
      }).success,
    ).toBe(true)
    expect(
      widgetStreamEventSchemas.done.safeParse({ status: 'succeeded', errorCode: null }).success,
    ).toBe(true)
  })

  it('registers the widget error codes', () => {
    for (const code of Object.values(AGENTS_ERROR_CODES)) expect(ERROR_CODES[code]).toBe(code)
  })
})
