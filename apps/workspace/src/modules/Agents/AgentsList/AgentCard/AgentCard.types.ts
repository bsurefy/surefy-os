// SPDX-License-Identifier: AGPL-3.0-only

import type { AgentDto } from '@surefy/contracts'
import type { ConfidenceThresholds } from '@surefy/ui/components/Feedback'

import type { AgentRowAction } from '../AgentsList.types'
import type { Route } from 'next'

export interface AgentCardProps {
  agent: AgentDto
  /** Where the card opens: the agent's editor. */
  href: Route
  thresholds: ConfidenceThresholds
  canCreate: boolean
  onAction: (action: AgentRowAction, agent: AgentDto) => void
}
