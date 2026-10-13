// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react'

export interface GuardReasonDialogLabels {
  /** The primary button repeats the verb ("Turn off rule", "Save defaults"). */
  confirm: string
  reason: string
  /** "Saved in the audit log." */
  reasonHelp: string
  /** "Give a reason for loosening Guard." */
  reasonRequired: string
}

export interface GuardReasonDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** The consequence ("Applies to all agents and flows that use defaults"). */
  description?: ReactNode
  /** What else is affected ("Affects 3 agents"), one line each. */
  impact?: ReactNode[]
  /** Loosening, turning off and deleting need a reason for the audit log; tightening does not. */
  isReasonRequired: boolean
  labels: GuardReasonDialogLabels
  tone?: 'destructive' | 'primary'
  /** Rejects when it fails: the dialog stays open with what was typed. */
  onConfirm: (details: { reason: string | undefined }) => Promise<unknown>
  /** Why the action failed. */
  error?: ReactNode
}
