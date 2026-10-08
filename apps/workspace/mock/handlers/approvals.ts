// SPDX-License-Identifier: AGPL-3.0-only
import {
  approvalDtoSchema,
  approveApprovalInputSchema,
  ERROR_CODES,
  okResponse,
} from '@surefy/contracts'
import type { ApprovalDto } from '@surefy/contracts'
import {
  defineMockDomain,
  defineMockHandler,
  mockError,
  mockOk,
} from '@surefy/web-core/testing/mock'

import { MAYA } from './shell.fixtures'

const HTTP_NOT_FOUND = 404
const HTTP_CONFLICT = 409

/** The approvals the mock holds: runs create them, and a decision changes them. */
let approvals = new Map<string, ApprovalDto>()

/** Back to no approvals; tests call it between cases. */
export function resetApprovalsMock(): void {
  approvals = new Map()
}

/** An approval a run is waiting for. */
export function addApproval(approval: ApprovalDto): void {
  approvals.set(approval.id, approval)
}

export const findApproval = (id: string): ApprovalDto | undefined => approvals.get(id)

/**
 * The approvals queue (Insights › Approvals). Only `approve` is built so far, for the agent editor's
 * "Approve as tester"; the queue screens add the rest. `error` fails a decision.
 */
export const approvalsDomain = defineMockDomain('approvals', [
  defineMockHandler({
    method: 'post',
    path: '/orgs/:orgId/approvals/:approvalId/approve',
    response: okResponse(approvalDtoSchema),
    scenarios: {
      default: async ({ params, request }) => {
        const approval = approvals.get(String(params.approvalId))
        if (!approval) {
          return mockError(HTTP_NOT_FOUND, ERROR_CODES.APPROVAL_NOT_FOUND, 'Approval not found')
        }
        approveApprovalInputSchema.parse(await request.json())
        if (approval.status !== 'pending') {
          return mockError(
            HTTP_CONFLICT,
            ERROR_CODES.APPROVAL_ALREADY_DECIDED,
            'Someone decided first',
          )
        }
        const now = new Date().toISOString()
        const decided: ApprovalDto = {
          ...approval,
          status: 'approved',
          decidedBy: MAYA,
          decidedAt: now,
          resolvedBy: 'user',
          canDecide: false,
          updatedAt: now,
        }
        approvals.set(decided.id, decided)
        return mockOk(decided)
      },
    },
  }),
])
