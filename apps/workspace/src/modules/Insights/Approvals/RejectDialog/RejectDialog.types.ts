// SPDX-License-Identifier: AGPL-3.0-only
import type { ApprovalDecisionReason } from '@surefy/contracts'

import type { ReactNode } from 'react'

export interface RejectValues {
  reason: ApprovalDecisionReason
  note?: string
}

export interface RejectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  /** May return a promise: the button shows its loading state and the dialog closes on success. */
  onConfirm: (values: RejectValues) => unknown
  /** Why the decision failed; the dialog stays open with what was typed. */
  error?: ReactNode
}
