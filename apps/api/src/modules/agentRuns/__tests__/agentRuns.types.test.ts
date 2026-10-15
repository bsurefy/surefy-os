// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { isRetryable } from '../agentRuns.types.js'

describe('isRetryable', () => {
  it('retries a run that ended without an answer', () => {
    for (const status of ['failed', 'timed_out', 'canceled'] as const) {
      expect(isRetryable({ status, isTest: false })).toBe(true)
    }
  })

  it('retries a test run that answered, but not a channel run that did', () => {
    expect(isRetryable({ status: 'succeeded', isTest: true })).toBe(true)
    expect(isRetryable({ status: 'succeeded', isTest: false })).toBe(false)
  })

  it('never retries an open run', () => {
    for (const status of ['queued', 'running', 'waiting_approval'] as const) {
      expect(isRetryable({ status, isTest: true })).toBe(false)
    }
  })
})
