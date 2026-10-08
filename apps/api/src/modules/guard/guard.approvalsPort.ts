// SPDX-License-Identifier: AGPL-3.0-only
import { settingsOf } from './guard.ruleSet.js'
import { DEFAULT_ESCALATION, type GuardSubjects } from './guard.types.js'

import type { GuardRepository } from './guard.repository.js'
import type { ApprovalLimits, ApprovalsGuard } from '../approvals/index.js'
import type { DbExecutor } from '@/core/database/index.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const AGENT_RULE_REF = /^agent:([0-9a-f-]{36}):v(\d+):(.+)$/i

export interface ApprovalsGuardDeps {
  repository: GuardRepository
  subjects: GuardSubjects
}

/**
 * What the approvals module reads from Guard: the quick-approve and step-up limits, the names of
 * the rules approvals came from, and who a timeout escalates to. The approvals module is built
 * before Guard (Guard creates approvals), so this port is built first and handed to it.
 */
export function createApprovalsGuard(deps: ApprovalsGuardDeps): ApprovalsGuard {
  return {
    async limits(tx: DbExecutor, orgId: string): Promise<ApprovalLimits> {
      const [row, currency] = await Promise.all([
        deps.repository.findSettings(tx, orgId),
        deps.repository.organizationCurrency(tx, orgId),
      ])
      const settings = settingsOf(row, currency)
      return {
        quickApproveMaxAmountMicros: settings.quickApproveMaxAmountMicros,
        quickApproveMaxRisk: settings.quickApproveMaxRisk,
        stepUpAmountMicros: settings.stepUpAmountMicros,
        targetDecisionMinutes: settings.targetDecisionMinutes,
      }
    },

    ruleNames(tx, orgId, ruleRefs) {
      return deps.repository.guardrailNames(
        tx,
        orgId,
        ruleRefs.filter((ref) => UUID.test(ref)),
      )
    },

    async escalationTargets(tx, orgId, approval) {
      const ref = approval.ruleRef
      if (ref === null) return DEFAULT_ESCALATION
      if (UUID.test(ref)) {
        const rule = await deps.repository.findGuardrail(tx, orgId, ref)
        const definition = rule?.definition
        const targets = definition?.kind === 'approval_rule' ? definition.escalateTo : []
        return targets.length > 0 ? targets : DEFAULT_ESCALATION
      }
      const agentRule = AGENT_RULE_REF.exec(ref)
      if (
        agentRule?.[1] !== undefined &&
        agentRule[2] !== undefined &&
        agentRule[3] !== undefined
      ) {
        const targets = await deps.subjects.agentRuleEscalation(tx, orgId, {
          agentId: agentRule[1],
          version: Number(agentRule[2]),
          ruleId: agentRule[3],
        })
        if (targets !== null && targets.length > 0) return targets
      }
      return DEFAULT_ESCALATION
    },
  }
}
