// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Globe, Pencil, Plug, Search, Workflow, X } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { toRoute } from '@/modules/Workspace'
import { AGENT_TOOL_PERMISSIONS } from '@surefy/contracts'
import type { AgentTool, AgentToolPermission } from '@surefy/contracts'
import { IconTile, StatusPill } from '@surefy/ui/components/DataDisplay'
import { SelectInput } from '@surefy/ui/components/Forms'
import { Button } from '@surefy/ui/primitives/button'
import { Switch } from '@surefy/ui/primitives/switch'

import { hostOf, needsConnection } from '../ToolsTab.utils'

import type { ToolRowProps } from './ToolRow.types'

const ICONS = {
  api: Globe,
  mcp: Plug,
  bridge_action: Plug,
  flow: Workflow,
  web_search: Search,
} as const

/** The second line of a row: what the tool calls. */
function useSubtitle(tool: AgentTool): string {
  const t = useTranslations('agents.editor.tools.row')
  switch (tool.kind) {
    case 'api':
      return `${tool.method} ${hostOf(tool.url)}`
    case 'mcp': {
      const on = tool.discoveredActions.filter((action) => action.enabled).length
      return tool.discoveredActions.length === 0
        ? hostOf(tool.serverUrl)
        : `${hostOf(tool.serverUrl)} · ${t('actionsOn', { on, total: tool.discoveredActions.length })}`
    }
    case 'bridge_action':
      return tool.actionName
    case 'flow':
    case 'web_search':
      return t(`kind.${tool.kind}`)
  }
}

/** One tool of the agent: what it is, its permission, on or off, and the state of its connection. */
export default function ToolRow({
  tool,
  connection,
  isLoadingConnections,
  borrowedFrom,
  suggestsApprovalRule,
  guardHref,
  connectionsHref,
  isReadOnly,
  onPermissionChange,
  onEnabledChange,
  onEdit,
  onRemove,
}: Readonly<ToolRowProps>) {
  const t = useTranslations('agents.editor.tools.row')
  const subtitle = useSubtitle(tool)
  const hasConnectionId = 'connectionId' in tool && tool.connectionId !== null
  const isUnavailable = hasConnectionId && connection === null && !isLoadingConnections
  const connectionNeedsAttention = connection !== null && connection.status !== 'active'

  return (
    <li className="border-border flex flex-col gap-2 rounded-lg border px-3 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <IconTile icon={ICONS[tool.kind]} size="sm" tone="primary" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-body text-foreground truncate font-medium">{tool.name}</span>
          <span className="text-caption text-muted-foreground truncate">
            {t(`kind.${tool.kind}`)} · {subtitle}
          </span>
        </div>
        {isReadOnly ? (
          <>
            <StatusPill tone="neutral" label={t(`permission.${tool.permission}`)} />
            <StatusPill
              tone={tool.enabled ? 'success' : 'neutral'}
              label={tool.enabled ? t('on') : t('off')}
            />
          </>
        ) : (
          <>
            <SelectInput<AgentToolPermission>
              className="w-36"
              aria-label={t('permissionOf', { name: tool.name })}
              options={AGENT_TOOL_PERMISSIONS.map((value) => ({
                value,
                label: t(`permission.${value}`),
              }))}
              value={tool.permission}
              onValueChange={onPermissionChange}
            />
            <Switch
              aria-label={t('toggle', { name: tool.name })}
              checked={tool.enabled}
              onCheckedChange={onEnabledChange}
            />
            {onEdit && (
              <Button
                type="button"
                variant="ghost"
                size="icon-md"
                icon={Pencil}
                aria-label={t('edit', { name: tool.name })}
                onClick={onEdit}
              />
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-md"
              icon={X}
              aria-label={t('remove', { name: tool.name })}
              onClick={onRemove}
            />
          </>
        )}
      </div>
      <div className="text-caption text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
        {connection !== null && (
          <span>
            {t('connection', { name: connection.name })}
            {borrowedFrom !== null && ` · ${t('borrowed', { owner: borrowedFrom })}`}
          </span>
        )}
        {connectionNeedsAttention && (
          <>
            <StatusPill tone="destructive" label={t(`connectionStatus.${connection.status}`)} />
            <Link href={toRoute(connectionsHref)} className="text-primary underline">
              {t('reconnect')}
            </Link>
          </>
        )}
        {isUnavailable && <StatusPill tone="warning" label={t('unavailable')} />}
        {needsConnection(tool) && !isUnavailable && (
          <StatusPill tone="warning" label={t('notConnected')} />
        )}
        {tool.kind === 'api' && tool.connectionId === null && <span>{t('noSignIn')}</span>}
        {suggestsApprovalRule && tool.enabled && (
          <span>
            {t('noApprovalRule')}{' '}
            <Link href={toRoute(guardHref)} className="text-primary underline">
              {t('addApprovalRule')}
            </Link>
          </span>
        )}
      </div>
    </li>
  )
}
