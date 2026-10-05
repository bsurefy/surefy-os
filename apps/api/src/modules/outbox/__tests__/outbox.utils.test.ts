// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { OUTBOX_TOPICS } from '../outbox.topics.js'
import { outboxJobId, relayErrorText, relayRetryDelayMs } from '../outbox.utils.js'

describe('outbox utils', () => {
  it('backs off 5 s × 2^attempts, at most an hour', () => {
    expect(relayRetryDelayMs(1)).toBe(10_000)
    expect(relayRetryDelayMs(3)).toBe(40_000)
    expect(relayRetryDelayMs(9)).toBe(2_560_000)
    expect(relayRetryDelayMs(10)).toBe(3_600_000)
  })

  it('names the delivery job after the event, a valid BullMQ job id', () => {
    const id = '0199b3a4-1e2f-7a00-8000-000000000001'
    expect(outboxJobId(id)).toBe(`outbox-${id}`)
    expect(outboxJobId(id)).not.toContain(':')
  })

  it('keeps the error code and message only, never more than 500 characters', () => {
    const error = Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' })
    expect(relayErrorText(error)).toBe('ECONNREFUSED: connection refused')
    expect(relayErrorText(new TypeError('x'.repeat(600)))).toHaveLength(500)
    expect(relayErrorText('nope')).toBe('UNKNOWN')
  })

  it('accepts only topics the table CHECK accepts', () => {
    for (const topic of OUTBOX_TOPICS) expect(topic).toMatch(/^[a-z_]+(\.[a-z_]+)+$/)
  })
})
