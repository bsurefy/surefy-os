// SPDX-License-Identifier: AGPL-3.0-only
import type { ApprovalDto } from '@surefy/contracts'

import type { ApprovalsFilters, BulkSelection } from './Approvals.types'
import type { ApprovalListFilters } from '@/api/approvals'

/** The list request for the page's view: pending oldest first, or decided today newest first. */
export function toListQuery(filters: ApprovalsFilters): ApprovalListFilters {
  return {
    q: filters.q || undefined,
    kind: filters.kind ?? undefined,
    risk: filters.risk ?? undefined,
    ...(filters.view === 'decided'
      ? { decidedToday: true, sort: '-decidedAt' }
      : { status: 'pending' as const, sort: 'createdAt' }),
  }
}

export function hasActiveFilters(filters: ApprovalsFilters): boolean {
  return filters.q !== '' || filters.kind !== null || filters.risk !== null
}

/** Whether the person may decide this item now. */
export function isDecidable(approval: Pick<ApprovalDto, 'status' | 'canDecide'>): boolean {
  return approval.status === 'pending' && approval.canDecide
}

/**
 * Bulk decisions are only for items of one rule that fit the quick-approve limit and need no
 * step-up. The selection is allowed when every selected row qualifies; `blockedCount` is how many
 * would have to leave it, keeping the largest group of one rule.
 */
export function getBulkSelection(
  rows: ApprovalDto[],
  selected: Record<string, true>,
): BulkSelection {
  const chosen = rows.filter((row) => selected[row.id])
  const perRule = new Map<string, number>()
  for (const row of chosen) {
    if (!isDecidable(row) || !row.quickApprovable || row.ruleRef === null) continue
    perRule.set(row.ruleRef, (perRule.get(row.ruleRef) ?? 0) + 1)
  }
  const keepable = Math.max(0, ...perRule.values())
  const blockedCount = chosen.length - keepable
  const isAllowed = chosen.length > 0 && blockedCount === 0
  return { ids: isAllowed ? chosen.map((row) => row.id) : [], blockedCount, isAllowed }
}

/** Who may decide, as a sentence part: "Finance, Admins". */
export function getAssigneeNames(
  approval: Pick<ApprovalDto, 'assignees'>,
  roleLabel: (role: string) => string,
): string {
  const names = approval.assignees.map((assignee) => {
    if (assignee.user) return assignee.user.name
    if (assignee.team) return assignee.team.name
    return assignee.role ? roleLabel(assignee.role) : ''
  })
  return [...new Set(names.filter(Boolean))].join(', ')
}
