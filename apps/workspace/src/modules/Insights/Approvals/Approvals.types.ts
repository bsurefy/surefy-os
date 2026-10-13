// SPDX-License-Identifier: AGPL-3.0-only
import type { ApprovalKind, ApprovalRisk } from '@surefy/contracts'

import type { ApprovalView } from './Approvals.constants'

export interface ApprovalsFilters {
  view: ApprovalView
  q: string
  kind: ApprovalKind | null
  risk: ApprovalRisk | null
}

/** What the selected rows allow: the ids a bulk decision would send, or why it is not offered. */
export interface BulkSelection {
  ids: string[]
  /** Selected rows that are not decidable in bulk, or sit beside another rule's items. */
  blockedCount: number
  isAllowed: boolean
}

/** A change to the filters; `null` clears a facet. */
export type ApprovalsFilterChange = {
  [Key in keyof ApprovalsFilters]?: ApprovalsFilters[Key] | null
}
