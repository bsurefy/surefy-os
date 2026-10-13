// SPDX-License-Identifier: AGPL-3.0-only
import type { AgentTool, ConnectionDto } from '@surefy/contracts'

type ApiTool = Extract<AgentTool, { kind: 'api' }>
type McpTool = Extract<AgentTool, { kind: 'mcp' }>

interface ToolDialogBaseProps {
  /** Every tool of the agent: a name is free when no other tool has it. */
  tools: readonly AgentTool[]
  /** The accounts the person may use for this kind of tool. */
  connections: readonly ConnectionDto[]
  isLoadingConnections: boolean
  onClose: () => void
}

export interface ApiToolDialogProps extends ToolDialogBaseProps {
  /** The tool being edited; none for a new one. */
  tool: ApiTool | null
  onSave: (tool: ApiTool) => void
}

export interface McpToolDialogProps extends ToolDialogBaseProps {
  tool: McpTool | null
  onSave: (tool: McpTool) => void
}
