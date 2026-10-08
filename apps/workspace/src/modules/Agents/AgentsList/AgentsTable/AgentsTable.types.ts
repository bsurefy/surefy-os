// SPDX-License-Identifier: AGPL-3.0-only

import type { AgentDto } from '@surefy/contracts'
import type { ConfidenceThresholds } from '@surefy/ui/components/Feedback'

import type { AgentSort } from '../AgentsList.constants'
import type { AgentRowAction } from '../AgentsList.types'
import type { ReactNode } from 'react'

export interface AgentsTableProps {
  agents: AgentDto[]
  isLoading: boolean
  sort: AgentSort
  onSortChange: (sort: AgentSort) => void
  /** Where an agent opens: its editor. */
  getHref: (agent: AgentDto) => string
  thresholds: ConfidenceThresholds
  canCreate: boolean
  onAction: (action: AgentRowAction, agent: AgentDto) => void
  emptyState: ReactNode
}
