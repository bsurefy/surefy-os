// SPDX-License-Identifier: AGPL-3.0-only
import type { AgentToolPermission, AgentTool, ConnectionDto } from '@surefy/contracts'

export interface ToolRowProps {
  tool: AgentTool
  /** The connection the tool uses; null when it uses none or the person may not see it. */
  connection: ConnectionDto | null
  /** The connection list is still loading: no "unavailable" note yet. */
  isLoadingConnections: boolean
  /** The tool acts through someone else's personal connection: "Uses Maya's connection". */
  borrowedFrom: string | null
  /** A "Can act" tool without an approval rule: Guard is suggested. */
  suggestsApprovalRule: boolean
  guardHref: string
  connectionsHref: string
  /** Archived, or the person may not edit: the row shows the tool and nothing to change. */
  isReadOnly: boolean
  onPermissionChange: (permission: AgentToolPermission) => void
  onEnabledChange: (enabled: boolean) => void
  /** Only tools this tab builds (API, MCP) have an edit dialog. */
  onEdit?: () => void
  onRemove: () => void
}
