// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import type { AgentRunStepDto } from '@surefy/contracts'

import {
  approvalSteps,
  guardCheckRows,
  isRunOpen,
  stepTotals,
  toWaterfall,
} from './RunDetail.utils'

const step = (
  seq: number,
  startedAt: string,
  durationMs: number | null,
  over: Partial<AgentRunStepDto> = {},
): AgentRunStepDto => ({
  id: `00000000-0000-4000-8000-00000000000${String(seq)}`,
  seq,
  type: 'model',
  name: `Step ${String(seq)}`,
  status: durationMs === null ? 'waiting' : 'succeeded',
  modelKey: null,
  inputTokens: 100,
  outputTokens: 20,
  costMicros: 1000,
  currency: 'USD',
  confidence: null,
  guardBand: null,
  approvalId: null,
  dataLocation: null,
  errorCode: null,
  startedAt,
  finishedAt:
    durationMs === null ? null : new Date(Date.parse(startedAt) + durationMs).toISOString(),
  durationMs,
  ...over,
})

describe('the run detail helpers', () => {
  it('places each step on the run timeline', () => {
    const bars = toWaterfall(
      [step(1, '2026-10-01T10:00:00.000Z', 1000), step(2, '2026-10-01T10:00:01.000Z', 3000)],
      0,
    )
    expect(bars.get(1)).toEqual({ offset: 0, width: 0.25 })
    expect(bars.get(2)).toEqual({ offset: 0.25, width: 0.75 })
  })

  it('runs an open step up to now and keeps instant steps visible', () => {
    const now = Date.parse('2026-10-01T10:00:10.000Z')
    const bars = toWaterfall(
      [step(1, '2026-10-01T10:00:00.000Z', 0), step(2, '2026-10-01T10:00:05.000Z', null)],
      now,
    )
    expect(bars.get(1)?.width).toBeCloseTo(0.01)
    expect(bars.get(2)).toEqual({ offset: 0.5, width: 0.5 })
  })

  it('lists the approval steps and the Guard outcomes that occurred', () => {
    const steps = [
      step(1, '2026-10-01T10:00:00.000Z', 10),
      step(2, '2026-10-01T10:00:01.000Z', null, {
        type: 'approval',
        approvalId: '00000000-0000-4000-8000-0000000000a1',
      }),
    ]
    expect(approvalSteps(steps).map((row) => row.seq)).toEqual([2])
    expect(
      guardCheckRows({
        version: 1,
        outcome: 'Done',
        toolsUsed: [],
        sourcesCount: 0,
        guardChecks: { blocked: 1, auto: 3 },
        approvalIds: [],
        dataLocations: [],
      }),
    ).toEqual([
      { outcome: 'auto', count: 3 },
      { outcome: 'blocked', count: 1 },
    ])
    expect(guardCheckRows(null)).toEqual([])
    expect(stepTotals(steps)).toEqual({ count: 2, tokens: 240, costMicros: 2000, currency: 'USD' })
  })

  it('knows which runs can still change', () => {
    expect(isRunOpen('waiting_approval')).toBe(true)
    expect(isRunOpen('timed_out')).toBe(false)
    expect(isRunOpen(undefined)).toBe(false)
  })
})
