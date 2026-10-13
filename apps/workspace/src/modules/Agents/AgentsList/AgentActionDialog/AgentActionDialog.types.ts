// SPDX-License-Identifier: AGPL-3.0-only
import type { AgentDto } from '@surefy/contracts'

import type { AgentDialogAction } from '../AgentsList.types'

export interface AgentActionDialogProps {
  orgId: string
  action: AgentDialogAction
  agent: AgentDto
  onClose: () => void
}
