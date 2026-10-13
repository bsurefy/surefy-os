// SPDX-License-Identifier: AGPL-3.0-only
import { PII_PATTERN_MAX_LENGTH } from '@surefy/contracts'

import { PII_PATTERN_MAX_REPEAT } from './guard.constants.js'

/**
 * Why a custom pattern cannot be saved, or null when it can: too long, not a regular expression,
 * or built to backtrack without end. The ML service compiles it again with its own engine and
 * stops a run that takes too long; this check keeps the obvious cases from being stored.
 */
export function customPatternProblem(pattern: string): string | null {
  if (pattern.length > PII_PATTERN_MAX_LENGTH) {
    return `The pattern can be at most ${String(PII_PATTERN_MAX_LENGTH)} characters`
  }
  try {
    new RegExp(pattern, 'u')
  } catch {
    try {
      new RegExp(pattern)
    } catch (error) {
      return `Not a valid regular expression: ${error instanceof Error ? error.message : 'unknown'}`
    }
  }
  if (hasNestedQuantifier(pattern)) {
    return 'The pattern repeats a repeated group, which can take forever on some text'
  }
  if (hasHugeRepeat(pattern)) {
    return `A repeat count can be at most ${String(PII_PATTERN_MAX_REPEAT)}`
  }
  return null
}

/** Escapes and character classes become one literal `x`, so only groups and quantifiers are left. */
function skeletonOf(pattern: string): string {
  let skeleton = ''
  let index = 0
  while (index < pattern.length) {
    const char = pattern[index] ?? ''
    if (char === '\\') {
      skeleton += 'x'
      index += 2
    } else if (char === '[') {
      index += 1
      while (index < pattern.length && pattern[index] !== ']')
        index += pattern[index] === '\\' ? 2 : 1
      skeleton += 'x'
      index += 1
    } else {
      skeleton += char
      index += 1
    }
  }
  return skeleton
}

const UNBOUNDED = /^(?:[+*]|\{\d+,\d*\})/

/** `(a+)+`, `(.*)*`, `(a|b+){2,}`: a group that contains a quantifier, itself quantified. */
function hasNestedQuantifier(pattern: string): boolean {
  const skeleton = skeletonOf(pattern)
  const stack: boolean[] = [] // per open group: does it contain an unbounded quantifier?
  for (let index = 0; index < skeleton.length; index++) {
    const char = skeleton[index]
    if (char === '(') {
      stack.push(false)
    } else if (char === ')') {
      const inside = stack.pop() ?? false
      if (inside && UNBOUNDED.test(skeleton.slice(index + 1))) return true
      if (inside && stack.length > 0) stack[stack.length - 1] = true
    } else if (stack.length > 0 && UNBOUNDED.test(skeleton.slice(index))) {
      stack[stack.length - 1] = true
    }
  }
  return false
}

function hasHugeRepeat(pattern: string): boolean {
  for (const match of pattern.matchAll(/\{(\d+)(?:,(\d*))?\}/g)) {
    const counts = [match[1], match[2]].filter(
      (value): value is string => value !== undefined && value !== '',
    )
    if (counts.some((count) => Number(count) > PII_PATTERN_MAX_REPEAT)) return true
  }
  return false
}
