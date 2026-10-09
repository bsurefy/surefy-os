// SPDX-License-Identifier: AGPL-3.0-only
import { AGENT_RUN_STEP_DATA_MAX_BYTES } from '@surefy/contracts'
import type { AgentRunStepData } from '@surefy/contracts'

const MIN_STRING = 64

const sizeOf = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), 'utf8')

/** The longest string in a value, by reference: its holder and key. */
function longestString(
  value: unknown,
  holder: Record<string, unknown> | unknown[] | null = null,
  key: string | number = '',
  best: {
    holder: Record<string, unknown> | unknown[]
    key: string | number
    length: number
  } | null = null,
): { holder: Record<string, unknown> | unknown[]; key: string | number; length: number } | null {
  if (typeof value === 'string') {
    return holder !== null && value.length > (best?.length ?? MIN_STRING)
      ? { holder, key, length: value.length }
      : best
  }
  if (Array.isArray(value)) {
    let result = best
    for (const [index, item] of value.entries()) {
      result = longestString(item, value, index, result)
    }
    return result
  }
  if (typeof value === 'object' && value !== null) {
    let result = best
    for (const [entryKey, entry] of Object.entries(value)) {
      result = longestString(entry, value as Record<string, unknown>, entryKey, result)
    }
    return result
  }
  return best
}

/**
 * Step input and output are capped at 64 KB (agent-runs.md, §9): a larger value has its longest
 * strings cut until it fits, and says so with `truncated: true`. The value is returned as is when
 * it already fits.
 */
export function capStepData<T extends AgentRunStepData>(data: T): T {
  if (sizeOf(data) <= AGENT_RUN_STEP_DATA_MAX_BYTES) return data
  const copy = structuredClone<T>(data)
  copy.truncated = true
  for (let guard = 0; guard < 200 && sizeOf(copy) > AGENT_RUN_STEP_DATA_MAX_BYTES; guard += 1) {
    const longest = longestString(copy)
    if (longest === null) break
    const holder = longest.holder as Record<string | number, unknown>
    const text = holder[longest.key] as string
    const keep = Math.max(MIN_STRING, Math.floor(text.length / 2))
    holder[longest.key] = `${text.slice(0, keep)}…`
  }
  // nothing left to cut (a very wide structure): keep the kind and say what happened
  if (sizeOf(copy) > AGENT_RUN_STEP_DATA_MAX_BYTES) {
    return { version: 1, kind: data.kind, truncated: true } as unknown as T
  }
  return copy
}

/** The size a step's JSON would take, for tests and logs. */
export const stepDataBytes = sizeOf
