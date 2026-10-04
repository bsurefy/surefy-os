// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react'

export interface ConfirmDialogLabels {
  /** The primary button repeats the verb ("Revoke key", "Delete knowledge base"). */
  confirm: string
  /** The shared "Cancel" label when omitted. */
  cancel?: string
  /** T3: "Reason". */
  reason?: string
  /** T3: "Saved in the audit log and shown in the audit entry." */
  reasonHelp?: string
  /** T3: "Enter a reason". */
  reasonRequired?: string
  /** T3: (name) => "Type Support triage to confirm". */
  typeToConfirm?: (name: string) => string
  /** T3: "The name does not match. Type Support triage". */
  typeMismatch?: (name: string) => string
}

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * T2 "Confirm with impact" (affects other people or running work) or T3 "Typed confirmation
   * and reason" (irreversible or organization-wide). T0 acts at once; T1 uses `toast.undo`.
   */
  tier: 'T2' | 'T3'
  /** Names the object: "Revoke the OpenAI key?". */
  title: string
  /** The consequence, and whether and how long it can be restored. */
  description?: ReactNode
  /** What else is affected ("3 agents use this key and will stop working"). */
  impact?: ReactNode[]
  labels: ConfirmDialogLabels
  /** T3: the object's name the person types. */
  confirmationText?: string
  /** `destructive` for removals and revokes. */
  tone?: 'destructive' | 'primary'
  /** May return a promise: the button shows its loading state and the dialog closes on success. */
  onConfirm: (details: { reason?: string }) => unknown
  /** Why the action failed; the dialog stays open. */
  error?: ReactNode
}
