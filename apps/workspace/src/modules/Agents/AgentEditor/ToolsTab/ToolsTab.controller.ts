// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { connectionQueries } from '@/api/connections'
import { ROUTES } from '@/constants/routes'
import { AGENT_TOOLS_MAX } from '@surefy/contracts'
import type { AgentTool, AgentToolPermission } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { useCurrentOrgId } from '@surefy/web-core/access'
import { meQueries } from '@surefy/web-core/api/me'

import { CONNECTION_LOOKUP_LIMIT } from './ToolsTab.constants'
import {
  changeToolEnabled,
  changeToolPermission,
  connectionIdOf,
  connectionsFor,
  insertTool,
  isApiTool,
  isBuildable,
  isMcpTool,
  lacksApprovalRule,
  upsertTool,
} from './ToolsTab.utils'

import type { BuildableToolKind, ToolDialogState, ToolsTabProps } from './ToolsTab.types'

/**
 * Tools: the agent's tools as a list, each switched, given a permission or removed at once, and the
 * dialogs that add or edit an API tool or an MCP server. Everything lands in the working copy;
 * autosave sends it.
 */
export function useToolsTabController({ agent, definition, onDefinitionChange }: ToolsTabProps) {
  const t = useTranslations('agents.editor.tools')
  const orgId = useCurrentOrgId()
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const { data: me } = useQuery(meQueries.current())
  const connectionsQuery = useInfiniteQuery(
    connectionQueries.list(orgId, { usable: true, limit: CONNECTION_LOOKUP_LIMIT }),
  )
  const connections = connectionsQuery.data?.pages.flatMap((page) => page.items) ?? []
  const [dialog, setDialog] = useState<ToolDialogState | null>(null)
  const { tools } = definition

  const update = (change: (current: AgentTool[]) => AgentTool[]) => {
    onDefinitionChange((current) => ({ ...current, tools: change([...current.tools]) }))
  }

  const rows = tools.map((tool) => {
    const connectionId = connectionIdOf(tool)
    const connection = connections.find(({ id }) => id === connectionId) ?? null
    return {
      tool,
      connection,
      borrowedFrom:
        connection?.scope === 'personal' && connection.owner && connection.owner.id !== me?.user.id
          ? connection.owner.name
          : null,
      suggestsApprovalRule: lacksApprovalRule(tool, definition.guard.approvalRules),
      isBuildable: isBuildable(tool),
    }
  })

  const closeDialog = () => {
    setDialog(null)
  }

  return {
    t,
    rows,
    isLoadingConnections: connectionsQuery.isPending,
    canAdd: tools.length < AGENT_TOOLS_MAX,
    guardHref: ROUTES.workspace.agent(orgSlug, agent.id, 'guard'),
    connectionsHref: ROUTES.workspace.settings(orgSlug, 'connections'),
    dialog,
    dialogProps: {
      tools,
      isLoadingConnections: connectionsQuery.isPending,
      onClose: closeDialog,
    },
    connectionsOf: (kind: BuildableToolKind) => connectionsFor(connections, kind),
    onAdd: (kind: BuildableToolKind) => {
      setDialog({ kind, tool: null })
    },
    onEdit: (tool: AgentTool) => {
      if (isApiTool(tool)) setDialog({ kind: 'api', tool })
      else if (isMcpTool(tool)) setDialog({ kind: 'mcp', tool })
    },
    onSave: (tool: AgentTool) => {
      update((current) => upsertTool(current, tool))
      closeDialog()
    },
    onPermissionChange: (toolId: string, permission: AgentToolPermission) => {
      update((current) => changeToolPermission(current, toolId, permission))
    },
    onEnabledChange: (toolId: string, enabled: boolean) => {
      update((current) => changeToolEnabled(current, toolId, enabled))
    },
    // T1: removed at once; Undo puts the tool back where it was
    onRemove: (tool: AgentTool) => {
      const index = tools.findIndex(({ id }) => id === tool.id)
      update((current) => current.filter(({ id }) => id !== tool.id))
      toast.undo(t('toasts.removed', { name: tool.name }), {
        undoLabel: t('toasts.undo'),
        onUndo: () => {
          update((current) => insertTool(current, tool, index))
        },
      })
    },
  }
}
