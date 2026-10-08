// SPDX-License-Identifier: AGPL-3.0-only
import type { AgentDto } from '@surefy/contracts'

import type { AgentRowAction } from '../AgentsList.types'

export interface AgentRowMenuProps {
  agent: AgentDto
  /** The person may create agents, which Duplicate needs. */
  canCreate: boolean
  onAction: (action: AgentRowAction, agent: AgentDto) => void
}
