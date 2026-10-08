// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { mergeApprovalRules, type ApprovalCandidate } from '../guard.merge.js'

const admin = { type: 'role', id: 'admin' } as const
const finance = { type: 'team', id: '0198f3a0-0000-7000-8000-0000000000f1' } as const
const omar = { type: 'user', id: '0198f3a0-0000-7000-8000-0000000000a1' } as const

const candidate = (overrides: Partial<ApprovalCandidate> = {}): ApprovalCandidate => ({
  ref: 'rule-1',
  scope: 'organization',
  approvers: [admin],
  waitMinutes: null,
  onTimeout: null,
  risk: 'low',
  ...overrides,
})

describe('mergeApprovalRules', () => {
  it('takes the approvers of the broadest scope; a narrower rule cannot change who approves', () => {
    const merged = mergeApprovalRules([
      candidate({ ref: 'agent-rule', scope: 'agent', approvers: [omar] }),
      candidate({ ref: 'org-rule', scope: 'organization', approvers: [finance] }),
      candidate({ ref: 'team-rule', scope: 'team', approvers: [admin] }),
    ])
    expect(merged.assignees).toEqual([finance])
    expect(merged.ruleRef).toBe('org-rule')
  })

  it('unites the approvers of rules in the same scope without repeating anyone', () => {
    const merged = mergeApprovalRules([
      candidate({ ref: 'a', approvers: [finance, admin] }),
      candidate({ ref: 'b', approvers: [admin, omar] }),
    ])
    expect(merged.assignees).toEqual([finance, admin, omar])
  })

  it('lets a narrower rule add an approval where none was required', () => {
    const merged = mergeApprovalRules([candidate({ scope: 'agent', approvers: [omar] })])
    expect(merged.assignees).toEqual([omar])
  })

  it('uses the shortest wait, the strictest timeout action and the highest risk', () => {
    const merged = mergeApprovalRules([
      candidate({ waitMinutes: 240, onTimeout: 'continue', risk: 'low' }),
      candidate({ waitMinutes: 60, onTimeout: 'escalate', risk: 'high' }),
      candidate({ waitMinutes: null, onTimeout: null, risk: 'medium' }),
    ])
    expect(merged).toMatchObject({ waitMinutes: 60, timeoutAction: 'escalate', risk: 'high' })
    const strict = mergeApprovalRules([
      candidate({ waitMinutes: 30, onTimeout: 'continue' }),
      candidate({ waitMinutes: 90, onTimeout: 'reject' }),
    ])
    expect(strict).toMatchObject({ waitMinutes: 30, timeoutAction: 'reject' })
  })

  it('waits until decided when no rule has a wait', () => {
    expect(mergeApprovalRules([candidate()])).toMatchObject({
      waitMinutes: null,
      timeoutAction: 'reject',
    })
  })
})
