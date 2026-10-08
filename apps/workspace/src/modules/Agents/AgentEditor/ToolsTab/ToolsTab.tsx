// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Globe, Plug, Plus, Wrench } from 'lucide-react'

import { EmptyState } from '@surefy/ui/components/DataDisplay'
import { Section } from '@surefy/ui/components/Layout'
import { Button } from '@surefy/ui/primitives/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@surefy/ui/primitives/dropdown-menu'

import { ApiToolDialog, McpToolDialog } from './ToolDialogs'
import ToolRow from './ToolRow'
import { useToolsTabController } from './ToolsTab.controller'
import { isApiTool, isMcpTool } from './ToolsTab.utils'

import type { ToolsTabProps } from './ToolsTab.types'

/**
 * Tools: what the agent may call, API tools and MCP servers built here, each with a permission
 * (Read only, Ask first, Can act), on or off, and its connection.
 */
export default function ToolsTab(props: Readonly<ToolsTabProps>) {
  const c = useToolsTabController(props)
  const { t } = c
  const { isReadOnly } = props
  const { dialog } = c

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Section
        title={t('title')}
        description={t('description')}
        actions={
          !isReadOnly && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" icon={Plus} disabled={!c.canAdd}>
                  {t('add.button')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => {
                    c.onAdd('api')
                  }}
                >
                  <Globe aria-hidden />
                  {t('add.api')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    c.onAdd('mcp')
                  }}
                >
                  <Plug aria-hidden />
                  {t('add.mcp')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }
      >
        {c.rows.length === 0 ? (
          <EmptyState
            icon={Wrench}
            headingLevel={3}
            title={t('empty.title')}
            description={isReadOnly ? t('empty.readOnly') : t('empty.description')}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {c.rows.map((row) => (
              <ToolRow
                key={row.tool.id}
                tool={row.tool}
                connection={row.connection}
                isLoadingConnections={c.isLoadingConnections}
                borrowedFrom={row.borrowedFrom}
                suggestsApprovalRule={row.suggestsApprovalRule}
                guardHref={c.guardHref}
                connectionsHref={c.connectionsHref}
                isReadOnly={isReadOnly}
                onPermissionChange={(permission) => {
                  c.onPermissionChange(row.tool.id, permission)
                }}
                onEnabledChange={(enabled) => {
                  c.onEnabledChange(row.tool.id, enabled)
                }}
                onEdit={
                  row.isBuildable
                    ? () => {
                        c.onEdit(row.tool)
                      }
                    : undefined
                }
                onRemove={() => {
                  c.onRemove(row.tool)
                }}
              />
            ))}
          </ul>
        )}
      </Section>
      {dialog?.kind === 'api' && (
        <ApiToolDialog
          {...c.dialogProps}
          connections={c.connectionsOf('api')}
          tool={dialog.tool && isApiTool(dialog.tool) ? dialog.tool : null}
          onSave={c.onSave}
        />
      )}
      {dialog?.kind === 'mcp' && (
        <McpToolDialog
          {...c.dialogProps}
          connections={c.connectionsOf('mcp')}
          tool={dialog.tool && isMcpTool(dialog.tool) ? dialog.tool : null}
          onSave={c.onSave}
        />
      )}
    </div>
  )
}
