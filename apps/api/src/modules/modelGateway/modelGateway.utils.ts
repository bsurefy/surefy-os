// SPDX-License-Identifier: AGPL-3.0-only
import type { ModelUsageDto } from '@surefy/contracts'

import type { ResolvedModel } from './modelGateway.types.js'

const PER_MILLION = 1_000_000

/** Tokens of one call; `cachedInputTokens` is the part of `inputTokens` read from a cache. */
export interface MeteredUsage {
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
}

/**
 * The cost of one call in micros of the model's currency: uncached input, cached input (at the
 * input price when no cached price is set) and output, each per million tokens. An unknown price
 * meters as 0 (Insights flags it).
 */
export function costMicros(usage: MeteredUsage, prices: ResolvedModel['prices']): number {
  const cached = Math.min(usage.cachedInputTokens, usage.inputTokens)
  const uncached = usage.inputTokens - cached
  const input = prices.input ?? 0
  const total =
    uncached * input +
    cached * (prices.cachedInput ?? input) +
    usage.outputTokens * (prices.output ?? 0)
  return Math.round(total / PER_MILLION)
}

export function toUsageDto(
  usage: MeteredUsage,
  cost: number,
  currency: string,
  timing: { firstTokenMs: number | null; latencyMs: number },
): ModelUsageDto {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    costMicros: cost,
    currency,
    firstTokenMs: timing.firstTokenMs === null ? null : Math.max(0, timing.firstTokenMs),
    latencyMs: Math.max(0, timing.latencyMs),
  }
}
