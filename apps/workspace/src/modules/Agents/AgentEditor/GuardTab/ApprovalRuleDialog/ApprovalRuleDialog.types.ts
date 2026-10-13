// SPDX-License-Identifier: AGPL-3.0-only
import type { AgentGuard } from '@surefy/contracts'

export interface ApprovalRuleDialogProps {
  /** The rule being edited; none for a new one. */
  rule: AgentGuard['approvalRules'][number] | null
  /** The action a new rule starts with ("Refund API"), when one is suggested. */
  action: string
  /** Names of the tools that are on, offered as quick choices for the action. */
  toolNames: readonly string[]
  onSave: (rule: AgentGuard['approvalRules'][number]) => void
  onClose: () => void
}
