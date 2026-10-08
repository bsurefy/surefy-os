// SPDX-License-Identifier: AGPL-3.0-only
import type { AgentTool } from '@surefy/contracts'

import type { AgentTabProps } from '../AgentEditor.types'

export type ToolsTabProps = AgentTabProps

/** The kinds of tool this tab builds; bridge actions and flows come from their own screens. */
export type BuildableToolKind = 'api' | 'mcp'

/** What the dialog is open for: a new tool of a kind, or a tool being edited. */
export type ToolDialogState =
  { kind: BuildableToolKind; tool: null } | { kind: BuildableToolKind; tool: AgentTool }
