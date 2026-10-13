// SPDX-License-Identifier: AGPL-3.0-only
import type { AgentDetailDto } from '@surefy/contracts'

import type { AgentEditorTab } from '../AgentEditor.constants'

export interface AgentEditorWorkspaceProps {
  agent: AgentDetailDto
  activeTab: AgentEditorTab
}
