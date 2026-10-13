// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest'

import {
  WIDGET_CONVERSATION_HEADER,
  WIDGET_MESSAGES_MAX,
  WIDGET_SCRIPT_PATH,
  WIDGET_STREAM_EVENTS,
  WIDGET_TOKEN_HEADER,
} from '@surefy/contracts'

import {
  CONVERSATION_HEADER,
  MESSAGES_MAX,
  SCRIPT_PATH,
  STREAM_EVENTS,
  TOKEN_HEADER,
} from './protocol.js'

// The widget repeats the contract's runtime values instead of importing them (ADR 0022).
describe('protocol', () => {
  it('matches the widget endpoint contract', () => {
    expect(TOKEN_HEADER).toBe(WIDGET_TOKEN_HEADER)
    expect(CONVERSATION_HEADER).toBe(WIDGET_CONVERSATION_HEADER)
    expect(SCRIPT_PATH).toBe(WIDGET_SCRIPT_PATH)
    expect(MESSAGES_MAX).toBe(WIDGET_MESSAGES_MAX)
    expect(STREAM_EVENTS).toEqual(WIDGET_STREAM_EVENTS)
  })
})
