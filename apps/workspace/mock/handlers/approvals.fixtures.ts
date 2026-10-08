// SPDX-License-Identifier: AGPL-3.0-only
import {
  approvalDetailDtoSchema,
  approvalDtoSchema,
  approvalSummaryDtoSchema,
} from '@surefy/contracts'
import type {
  ApprovalDetailDto,
  ApprovalDto,
  ApprovalPayload,
  ApprovalSummaryDto,
} from '@surefy/contracts'
import { defineFactory, fixtureUuid } from '@surefy/web-core/testing'

import { MAYA, OMAR } from './shell.fixtures'

const APPROVAL_KIND = 90
// Ids of the agents and the Guard rule the approvals come from. They are spelled out here
// because the agents and guard fixtures import the approvals mock (agent runs create approvals).
const SUPPORT_AGENT_ID = fixtureUuid(70, 1)
const DRAFT_AGENT_ID = fixtureUuid(70, 2)
const REFUND_RULE_ID = fixtureUuid(80, 1)
const CURRENCY = 'USD'
const MICROS = 1_000_000
const MINUTE_MS = 60_000
/** The moment the mock treats as "now", so ages and "decided today" do not depend on the clock. */
export const APPROVALS_NOW = '2026-01-15T09:00:00.000Z'

const minutesAgo = (minutes: number) =>
  new Date(Date.parse(APPROVALS_NOW) - minutes * MINUTE_MS).toISOString()

export const REFUND_SMALL_ID = fixtureUuid(APPROVAL_KIND, 1)
export const REFUND_SECOND_ID = fixtureUuid(APPROVAL_KIND, 2)
export const PAYMENT_LARGE_ID = fixtureUuid(APPROVAL_KIND, 3)
export const BRIDGE_REQUEST_ID = fixtureUuid(APPROVAL_KIND, 4)
export const FINANCE_ONLY_ID = fixtureUuid(APPROVAL_KIND, 5)
export const OVERDUE_ID = fixtureUuid(APPROVAL_KIND, 6)
export const CHANNEL_REQUEST_ID = fixtureUuid(APPROVAL_KIND, 7)
export const DECIDED_ID = fixtureUuid(APPROVAL_KIND, 8)
export const REJECTED_ID = fixtureUuid(APPROVAL_KIND, 9)
export const EXPIRED_ID = fixtureUuid(APPROVAL_KIND, 10)

const SUPPORT_AGENT = { id: SUPPORT_AGENT_ID, name: 'Support triage' }
const DRAFT_AGENT = { id: DRAFT_AGENT_ID, name: 'Invoice helper' }

/** The unit amounts below are whole currency units; the API stores micros. */
export const toMicros = (amount: number) => amount * MICROS

/** A pending AI action the viewer can decide, unless overridden. */
export const approvalFactory = defineFactory(approvalDtoSchema, (sequence): ApprovalDto => ({
  id: fixtureUuid(APPROVAL_KIND, sequence),
  kind: 'ai_action',
  status: 'pending',
  title: `Refund order #${1000 + sequence}`,
  amountMicros: toMicros(42),
  currency: CURRENCY,
  confidence: 0.91,
  risk: 'low',
  ruleRef: REFUND_RULE_ID,
  ruleName: 'Refunds above $200 need approval',
  agent: SUPPORT_AGENT,
  flow: null,
  agentRunId: fixtureUuid(APPROVAL_KIND + 1, sequence),
  flowRunId: null,
  requestedBy: null,
  decidedBy: null,
  decidedAt: null,
  decisionReason: null,
  decisionNote: null,
  requiresStepUp: false,
  expiresAt: minutesAgo(-1440),
  timeoutAction: 'reject',
  escalatedAt: null,
  resolvedBy: null,
  assignees: [{ subjectType: 'role', user: null, team: null, role: 'admin', source: 'rule' }],
  canDecide: true,
  isOverdue: false,
  quickApprovable: true,
  createdAt: minutesAgo(120),
  updatedAt: minutesAgo(120),
}))

const aiPayload = (name: string, input: Record<string, unknown>): ApprovalPayload => ({
  version: 1,
  kind: 'ai_action',
  action: { name, input },
  reasoning: [
    {
      text: 'The customer reported the parcel as lost and the carrier confirmed it.',
      confidence: 0.93,
    },
    { text: 'The amount is within the refund policy for lost parcels.', confidence: 0.88 },
  ],
  sources: [
    { title: 'Refund policy', documentId: null, ref: 'Section 3.2' },
    { title: 'Carrier tracking update', documentId: null, ref: null },
  ],
  stepRef: { seq: 4 },
})

/** What each seeded approval will do; items without an entry here are request kinds. */
const PAYLOADS: Record<string, ApprovalPayload> = {
  [REFUND_SMALL_ID]: aiPayload('payments.refund', {
    orderId: '1001',
    amount: 42,
    note: 'Lost parcel',
  }),
  [REFUND_SECOND_ID]: aiPayload('payments.refund', {
    orderId: '1002',
    amount: 18,
    note: 'Damaged item',
  }),
  [PAYMENT_LARGE_ID]: aiPayload('payments.send', {
    payee: 'Northwind Ltd',
    amount: 7850,
    note: 'Invoice 5521',
  }),
  [FINANCE_ONLY_ID]: aiPayload('payments.refund', {
    orderId: '1005',
    amount: 310,
    note: 'Duplicate charge',
  }),
  [OVERDUE_ID]: aiPayload('crm.update_deal', { dealId: 'D-77', stage: 'Closed lost' }),
  [DECIDED_ID]: aiPayload('payments.refund', {
    orderId: '0990',
    amount: 25,
    note: 'Late delivery',
  }),
  [REJECTED_ID]: aiPayload('payments.refund', { orderId: '0991', amount: 95, note: 'Not covered' }),
  [EXPIRED_ID]: aiPayload('crm.update_deal', { dealId: 'D-12', stage: 'Closed won' }),
  [BRIDGE_REQUEST_ID]: {
    version: 1,
    kind: 'bridge_install',
    bridgeId: fixtureUuid(APPROVAL_KIND + 2, 1),
    versionId: fixtureUuid(APPROVAL_KIND + 2, 2),
    requestedScopes: ['calendar.read', 'calendar.write'],
  },
  [CHANNEL_REQUEST_ID]: {
    version: 1,
    kind: 'channel_publish',
    agentId: DRAFT_AGENT_ID,
    channelId: fixtureUuid(APPROVAL_KIND + 3, 1),
    channelType: 'widget',
    exposure: 'Anyone with the link can ask the agent about invoices.',
  },
}

export function seedApprovals(): ApprovalDto[] {
  approvalFactory.reset()
  return [
    approvalFactory({
      id: OVERDUE_ID,
      title: 'Mark deal D-77 as lost',
      amountMicros: null,
      confidence: 0.64,
      risk: 'medium',
      ruleRef: null,
      ruleName: null,
      quickApprovable: false,
      isOverdue: true,
      createdAt: minutesAgo(3 * 1440),
    }),
    approvalFactory({
      id: REFUND_SMALL_ID,
      title: 'Refund order #1001',
      createdAt: minutesAgo(180),
    }),
    approvalFactory({
      id: REFUND_SECOND_ID,
      title: 'Refund order #1002',
      amountMicros: toMicros(18),
      confidence: 0.87,
      createdAt: minutesAgo(150),
    }),
    approvalFactory({
      id: PAYMENT_LARGE_ID,
      title: 'Pay Northwind Ltd',
      amountMicros: toMicros(7850),
      confidence: 0.74,
      risk: 'high',
      ruleRef: 'agent:support:v3:payments',
      ruleName: null,
      requiresStepUp: true,
      quickApprovable: false,
      createdAt: minutesAgo(90),
    }),
    approvalFactory({
      id: BRIDGE_REQUEST_ID,
      kind: 'bridge_install',
      title: 'Install Calendar bridge',
      amountMicros: null,
      confidence: null,
      risk: 'medium',
      ruleRef: null,
      ruleName: null,
      agent: null,
      agentRunId: null,
      requestedBy: OMAR,
      quickApprovable: false,
      createdAt: minutesAgo(60),
    }),
    approvalFactory({
      id: CHANNEL_REQUEST_ID,
      kind: 'channel_publish',
      title: 'Publish Invoice helper to the website widget',
      amountMicros: null,
      confidence: null,
      risk: 'medium',
      ruleRef: null,
      ruleName: null,
      agent: DRAFT_AGENT,
      agentRunId: null,
      requestedBy: OMAR,
      quickApprovable: false,
      createdAt: minutesAgo(45),
    }),
    approvalFactory({
      id: FINANCE_ONLY_ID,
      title: 'Refund order #1005',
      amountMicros: toMicros(310),
      risk: 'medium',
      canDecide: false,
      quickApprovable: false,
      assignees: [
        {
          subjectType: 'team',
          user: null,
          team: { id: fixtureUuid(30, 9), name: 'Finance' },
          role: null,
          source: 'rule',
        },
      ],
      createdAt: minutesAgo(30),
    }),
    approvalFactory({
      id: DECIDED_ID,
      status: 'approved',
      title: 'Refund order #0990',
      amountMicros: toMicros(25),
      decidedBy: OMAR,
      decidedAt: minutesAgo(200),
      resolvedBy: 'user',
      quickApprovable: false,
      createdAt: minutesAgo(400),
    }),
    approvalFactory({
      id: REJECTED_ID,
      status: 'rejected',
      title: 'Refund order #0991',
      amountMicros: toMicros(95),
      decidedBy: MAYA,
      decidedAt: minutesAgo(100),
      decisionReason: 'not_eligible',
      decisionNote: 'Not covered by the policy.',
      resolvedBy: 'user',
      quickApprovable: false,
      createdAt: minutesAgo(380),
    }),
    approvalFactory({
      id: EXPIRED_ID,
      status: 'expired',
      title: 'Mark deal D-12 as won',
      amountMicros: null,
      resolvedBy: 'timeout',
      decidedAt: minutesAgo(20),
      quickApprovable: false,
      createdAt: minutesAgo(1500),
    }),
  ]
}

/** The item with what will happen; the id picks the payload. */
export function toDetail(
  approval: ApprovalDto,
  edited: Record<string, unknown> | null,
): ApprovalDetailDto {
  const payload = PAYLOADS[approval.id] ?? aiPayload('tools.run', {})
  const editedPayload: ApprovalPayload | null =
    edited && (payload.kind === 'ai_action' || payload.kind === 'flow_step')
      ? { ...payload, action: { ...payload.action, input: edited } }
      : null
  return approvalDetailDtoSchema.parse({ ...approval, payload, editedPayload })
}

export function toSummary(items: ApprovalDto[]): ApprovalSummaryDto {
  const pending = items.filter((item) => item.status === 'pending')
  return approvalSummaryDtoSchema.parse({
    pending: pending.length,
    pendingForMe: pending.filter((item) => item.canDecide).length,
    overdue: pending.filter((item) => item.isOverdue).length,
    decidedToday: items.filter(
      (item) => item.status !== 'pending' && item.decidedAt?.startsWith('2026-01-15') === true,
    ).length,
  })
}
