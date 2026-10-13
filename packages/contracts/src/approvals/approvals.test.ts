// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  APPROVAL_AUDIT_ACTIONS,
  APPROVAL_BULK_MAX,
  APPROVALS_ERROR_CODES,
  APPROVALS_PERMISSIONS,
  approvalPayloadSchema,
  approveApprovalInputSchema,
  approverSchema,
  bulkDecideInputSchema,
  ERROR_CODES,
  listApprovalsQuerySchema,
  rejectApprovalInputSchema,
  ROLE_PERMISSIONS,
} from '../index.js'

const id = '0190a5c4-0000-7000-8000-000000000001'
const id2 = '0190a5c4-0000-7000-8000-000000000002'

describe('approval payloads', () => {
  const aiAction = {
    version: 1,
    kind: 'ai_action',
    action: { name: 'payments.refund', input: { amount: 340, orderId: '1182' } },
    reasoning: [{ text: 'Order was never delivered', confidence: 0.82 }],
    sources: [{ title: 'Refund policy', documentId: id, ref: null }],
    stepRef: { seq: 4 },
  }

  it('reads each kind by its own fields', () => {
    expect(approvalPayloadSchema.safeParse(aiAction).success).toBe(true)
    expect(
      approvalPayloadSchema.safeParse({ ...aiAction, kind: 'flow_step', stepRef: { nodeId: 'n1' } })
        .success,
    ).toBe(true)
    expect(
      approvalPayloadSchema.safeParse({ ...aiAction, stepRef: { nodeId: 'n1' } }).success,
    ).toBe(false)
    expect(
      approvalPayloadSchema.safeParse({
        version: 1,
        kind: 'bridge_update',
        bridgeId: id,
        versionId: id2,
        requestedScopes: ['chat:write'],
        addedScopes: ['files:read'],
      }).success,
    ).toBe(true)
    expect(
      approvalPayloadSchema.safeParse({
        version: 1,
        kind: 'bridge_update',
        bridgeId: id,
        versionId: id2,
        requestedScopes: [],
      }).success,
    ).toBe(false)
    expect(
      approvalPayloadSchema.safeParse({
        version: 1,
        kind: 'channel_publish',
        agentId: id,
        channelId: id2,
        channelType: 'slack',
        exposure: 'Anyone in the workspace',
      }).success,
    ).toBe(true)
    expect(approvalPayloadSchema.safeParse({ ...aiAction, kind: 'other' }).success).toBe(false)
  })

  it('names approvers by id, or a built-in role by name', () => {
    expect(approverSchema.safeParse({ type: 'user', id }).success).toBe(true)
    expect(approverSchema.safeParse({ type: 'role', id: 'admin' }).success).toBe(true)
    expect(approverSchema.safeParse({ type: 'role', id }).success).toBe(false)
    expect(approverSchema.safeParse({ type: 'team', id: 'finance' }).success).toBe(false)
  })
})

describe('approval decisions', () => {
  it('approves with optional edited fields from the queue by default', () => {
    expect(approveApprovalInputSchema.parse({})).toEqual({ via: 'queue' })
    expect(
      approveApprovalInputSchema.safeParse({ editedInput: { amount: 200 }, via: 'popover' })
        .success,
    ).toBe(true)
    expect(approveApprovalInputSchema.safeParse({ via: 'bulk' }).success).toBe(false)
  })

  it('needs a reason to reject, and a note for Other', () => {
    expect(rejectApprovalInputSchema.safeParse({}).success).toBe(false)
    expect(rejectApprovalInputSchema.safeParse({ reason: 'wrong_team' }).success).toBe(true)
    expect(rejectApprovalInputSchema.safeParse({ reason: 'other' }).success).toBe(false)
    expect(
      rejectApprovalInputSchema.safeParse({ reason: 'other', note: ' Duplicate ' }),
    ).toMatchObject({ success: true, data: { note: 'Duplicate' } })
  })

  it('bulk decides distinct ids up to the cap, with a reason when rejecting', () => {
    expect(bulkDecideInputSchema.safeParse({ ids: [id, id2], decision: 'approve' }).success).toBe(
      true,
    )
    expect(bulkDecideInputSchema.safeParse({ ids: [id, id], decision: 'approve' }).success).toBe(
      false,
    )
    expect(bulkDecideInputSchema.safeParse({ ids: [], decision: 'approve' }).success).toBe(false)
    expect(
      bulkDecideInputSchema.safeParse({
        ids: Array.from(
          { length: APPROVAL_BULK_MAX + 1 },
          (_, i) => `0190a5c4-0000-7000-8000-${String(i).padStart(12, '0')}`,
        ),
        decision: 'approve',
      }).success,
    ).toBe(false)
    expect(bulkDecideInputSchema.safeParse({ ids: [id], decision: 'reject' }).success).toBe(false)
    expect(
      bulkDecideInputSchema.safeParse({ ids: [id], decision: 'reject', reason: 'not_eligible' })
        .success,
    ).toBe(true)
    expect(
      bulkDecideInputSchema.safeParse({ ids: [id], decision: 'reject', reason: 'other' }).success,
    ).toBe(false)
  })

  it('turns filters into arrays and reads the queue flags', () => {
    expect(listApprovalsQuerySchema.parse({ status: 'pending' }).status).toEqual(['pending'])
    expect(listApprovalsQuerySchema.parse({ canDecide: 'true' }).canDecide).toBe(true)
    expect(listApprovalsQuerySchema.parse({ quickApprovable: 'false' }).quickApprovable).toBe(false)
    expect(listApprovalsQuerySchema.safeParse({ sort: '-amountMicros' }).success).toBe(true)
    expect(listApprovalsQuerySchema.safeParse({ sort: 'title' }).success).toBe(false)
  })
})

describe('approval codes, permissions and audit', () => {
  it('registers every error code', () => {
    for (const code of Object.values(APPROVALS_ERROR_CODES)) expect(ERROR_CODES[code]).toBe(code)
  })

  it('lets every role see and decide what it is assigned to', () => {
    expect(ROLE_PERMISSIONS.user).toContain(APPROVALS_PERMISSIONS.APPROVALS_DECIDE.key)
    expect(ROLE_PERMISSIONS.user).toContain(APPROVALS_PERMISSIONS.APPROVALS_READ.key)
  })

  it('names audit actions <area>.<verb>', () => {
    for (const action of Object.values(APPROVAL_AUDIT_ACTIONS)) {
      expect(action).toMatch(/^approval\.[a-z_]+$/)
    }
  })
})
