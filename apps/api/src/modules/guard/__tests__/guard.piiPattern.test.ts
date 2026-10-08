// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { customPatternProblem } from '../guard.piiPattern.js'

describe('customPatternProblem', () => {
  it.each(['EMP-\\d{6}', '[A-Z]{2}\\d{4}', '(?:ab|cd)+x', '\\b\\d{3}-\\d{2}\\b', 'a(b)c'])(
    'accepts %s',
    (pattern) => {
      expect(customPatternProblem(pattern)).toBeNull()
    },
  )

  it.each(['(a+)+', '(.*)*', '(a|b+){2,}', '((x+)y)+', '(\\d+)*z'])(
    'rejects %s, which can backtrack without end',
    (pattern) => {
      expect(customPatternProblem(pattern)).toMatch(/repeats a repeated group/)
    },
  )

  it('does not mistake a quantifier in a class or an escape for one in a group', () => {
    expect(customPatternProblem('([+*]\\+)+')).toBeNull()
  })

  it('rejects a pattern that does not compile', () => {
    expect(customPatternProblem('(unclosed')).toMatch(/Not a valid regular expression/)
    expect(customPatternProblem('[z-a]')).toMatch(/Not a valid regular expression/)
  })

  it('rejects a pattern that is too long and a huge repeat count', () => {
    expect(customPatternProblem('a'.repeat(501))).toMatch(/at most 500/)
    expect(customPatternProblem('a{5000}')).toMatch(/repeat count/)
  })
})
