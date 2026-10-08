// SPDX-License-Identifier: AGPL-3.0-only
import { APPROVAL_RISKS, APPROVAL_TIMEOUT_ACTIONS } from '@surefy/contracts'
import type { Approver, ApprovalRisk, ApprovalTimeoutAction } from '@surefy/contracts'

/** Where a rule comes from; the organization is the broadest, an agent the narrowest. */
export type RuleScope = 'organization' | 'team' | 'agent'

const SCOPE_RANK: Record<RuleScope, number> = { organization: 0, team: 1, agent: 2 }

/** An approval rule that matched, from any level. */
export interface ApprovalCandidate {
  /** A guardrail id, or `agent:{id}:v{n}:{ruleId}`. */
  ref: string
  scope: RuleScope
  approvers: readonly Approver[]
  waitMinutes: number | null
  onTimeout: ApprovalTimeoutAction | null
  risk: ApprovalRisk
}

/** One approval for the action, merged from every rule that asked for it. */
export interface MergedApproval {
  /** The first rule of the broadest scope: its escalation targets apply to a timeout. */
  ruleRef: string | null
  assignees: readonly Approver[]
  waitMinutes: number | null
  timeoutAction: ApprovalTimeoutAction
  risk: ApprovalRisk
}

const approverKey = (approver: Approver): string => `${approver.type}:${approver.id}`

/** `reject` over `escalate` over `continue`. */
const strictestTimeout = (actions: readonly ApprovalTimeoutAction[]): ApprovalTimeoutAction =>
  APPROVAL_TIMEOUT_ACTIONS.find((action) => actions.includes(action)) ?? 'reject'

const highestRisk = (risks: readonly ApprovalRisk[]): ApprovalRisk =>
  [...APPROVAL_RISKS].reverse().find((risk) => risks.includes(risk)) ?? 'low'

/**
 * One approval per action (database/guard-and-approvals.md, "How rules merge"). Who approves
 * comes from the broadest scope that matched: a narrower rule can add an approval where none was
 * required but cannot change who decides when a broader rule already requires one. The wait is the
 * shortest, the timeout action the strictest and the risk the highest.
 */
export function mergeApprovalRules(
  candidates: readonly [ApprovalCandidate, ...ApprovalCandidate[]],
): MergedApproval {
  const broadest = Math.min(...candidates.map((candidate) => SCOPE_RANK[candidate.scope]))
  const deciding = candidates.filter((candidate) => SCOPE_RANK[candidate.scope] === broadest)
  const assignees = new Map<string, Approver>()
  for (const candidate of deciding) {
    for (const approver of candidate.approvers) assignees.set(approverKey(approver), approver)
  }
  const waits = candidates.flatMap((candidate) =>
    candidate.waitMinutes === null ? [] : [candidate.waitMinutes],
  )
  const timeouts = candidates.flatMap((candidate) =>
    candidate.waitMinutes === null || candidate.onTimeout === null ? [] : [candidate.onTimeout],
  )
  return {
    ruleRef: (deciding[0] ?? candidates[0]).ref,
    assignees: [...assignees.values()],
    waitMinutes: waits.length === 0 ? null : Math.min(...waits),
    timeoutAction: strictestTimeout(timeouts),
    risk: highestRisk(candidates.map((candidate) => candidate.risk)),
  }
}
