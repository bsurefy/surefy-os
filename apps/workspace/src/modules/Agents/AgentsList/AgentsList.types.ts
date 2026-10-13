// SPDX-License-Identifier: AGPL-3.0-only
import type { AgentDto } from '@surefy/contracts'

/** What the "⋯" menu of an agent offers. */
export const AGENT_ROW_ACTIONS = [
  'duplicate',
  'pause',
  'resume',
  'archive',
  'restore',
  'delete',
] as const
export type AgentRowAction = (typeof AGENT_ROW_ACTIONS)[number]

/** The actions that open a confirmation dialog (T2 or T3). */
export type AgentDialogAction = 'pause' | 'archive' | 'delete'

export interface AgentDialogState {
  action: AgentDialogAction
  agent: AgentDto
}

/** "Shared with" on a card or row, ready to be written in the person's language. */
export type SharedWithSummary =
  | { kind: 'everyone' }
  | { kind: 'none' }
  | { kind: 'some'; teamNames: string[]; moreTeams: number; people: number }

export type TrustDisplay = { kind: 'score'; value: number } | { kind: 'notEnough' }
