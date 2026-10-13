// SPDX-License-Identifier: AGPL-3.0-only
import type { ApprovalRow } from './approvals.repository.js'
import type { ApprovalResolution } from './approvals.types.js'

const editedInputOf = (row: ApprovalRow): Readonly<Record<string, unknown>> | null => {
  const payload = row.editedPayload
  if (payload?.kind !== 'ai_action' && payload?.kind !== 'flow_step') return null
  return payload.action.input
}

/**
 * Reads an approval as the run behind it does: approved (possibly with edits) and a timeout that
 * continues run the action; a rejection, a timeout that rejects and a cancel do not.
 */
export function resolutionOf(row: ApprovalRow): ApprovalResolution {
  const base = {
    id: row.id,
    status: row.status,
    editedInput: null,
    ruleRef: row.ruleRef,
    agentRunId: row.agentRunId,
    decidedAt: row.decidedAt,
  }
  switch (row.status) {
    case 'pending':
      return { ...base, outcome: 'pending' }
    case 'approved': {
      const editedInput = editedInputOf(row)
      return editedInput === null
        ? { ...base, outcome: 'approved' }
        : { ...base, outcome: 'approved_with_edits', editedInput }
    }
    case 'expired':
      return {
        ...base,
        outcome: row.timeoutAction === 'continue' ? 'timed_out_continued' : 'timed_out_rejected',
      }
    case 'rejected':
    case 'canceled':
      return { ...base, outcome: 'rejected' }
  }
}
