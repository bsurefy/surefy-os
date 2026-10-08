// SPDX-License-Identifier: AGPL-3.0-only
import { useTranslations } from 'next-intl'

import type { ApprovalDto } from '@surefy/contracts'

import { getAssigneeNames } from './Approvals.utils'

/** How an approval reads on screen: kind, risk, outcome and who can decide it. */
export function useApprovalLabels() {
  const t = useTranslations('insights.approvals')
  const roleLabel = (role: string) =>
    t.has(`assigneeRole.${role}`) ? t(`assigneeRole.${role}`) : role

  return {
    kind: (kind: ApprovalDto['kind']) => t(`kinds.${kind}`),
    risk: (risk: ApprovalDto['risk']) => t(`risks.${risk}`),
    status: (status: ApprovalDto['status']) => t(`statuses.${status}`),
    assignees: (approval: Pick<ApprovalDto, 'assignees'>) => getAssigneeNames(approval, roleLabel),
    reason: (reason: string) => t(`reject.reasons.${reason}`),
  }
}
