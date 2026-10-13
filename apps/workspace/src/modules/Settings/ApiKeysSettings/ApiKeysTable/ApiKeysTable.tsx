// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Ellipsis } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'

import type { ApiKeyDto } from '@surefy/contracts'
import { DataTable, StatusPill } from '@surefy/ui/components/DataDisplay'
import type { DataTableColumn } from '@surefy/ui/components/DataDisplay'
import { Button } from '@surefy/ui/primitives/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@surefy/ui/primitives/dropdown-menu'

import { API_KEY_DIALOG } from '../ApiKeysSettings.constants'
import { getApiKeyRowStatus, splitScopes, toSortParam } from '../ApiKeysSettings.utils'

import type { ApiKeysTableProps } from './ApiKeysTable.types'

const STATUS_TONE = { active: 'success', expired: 'warning', revoked: 'neutral' } as const

/** The API keys table: name, visible start of the key, permissions, creator, expiry and use. */
export default function ApiKeysTable({
  rows,
  isLoading,
  sort,
  onSortChange,
  emptyState,
  canManage,
  onOpen,
  onAction,
}: Readonly<ApiKeysTableProps>) {
  const t = useTranslations('settings.apiKeys')
  const format = useFormatter()
  const formatDate = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium' })
  const scopeName = (scope: string) =>
    t.has(`scopes.${scope}.name`) ? t(`scopes.${scope}.name`) : scope

  const columns: DataTableColumn<ApiKeyDto>[] = [
    {
      id: 'name',
      header: t('columns.name'),
      isSortable: true,
      isHideable: false,
      cell: (row) => (
        <Button
          variant="link"
          className="h-auto min-w-0 justify-start p-0 font-medium"
          onClick={() => {
            onOpen(row)
          }}
        >
          <span className="truncate">{row.name}</span>
        </Button>
      ),
    },
    {
      id: 'key',
      header: t('columns.key'),
      cell: (row) => <span className="text-code font-mono">{row.keyPrefix}…</span>,
    },
    {
      id: 'permissions',
      header: t('columns.permissions'),
      cell: (row) => {
        const { shown, more } = splitScopes(row.scopes)
        return (
          <span className="flex flex-wrap gap-1" title={row.scopes.map(scopeName).join(', ')}>
            {shown.map((scope) => (
              <span key={scope} className="bg-surface-2 text-label rounded-md px-1.5 py-0.5">
                {scopeName(scope)}
              </span>
            ))}
            {more > 0 && (
              <span className="bg-surface-2 text-label rounded-md px-1.5 py-0.5">
                {t('moreScopes', { count: more })}
              </span>
            )}
          </span>
        )
      },
    },
    {
      id: 'createdAt',
      header: t('columns.createdBy'),
      isSortable: true,
      cell: (row) => (
        <div className="flex min-w-0 flex-col">
          <span className="text-body truncate">{row.createdBy?.name ?? t('formerMember')}</span>
          <span className="text-caption text-muted-foreground">{formatDate(row.createdAt)}</span>
        </div>
      ),
    },
    {
      id: 'expiresAt',
      header: t('columns.expires'),
      cell: (row) => (
        <span className="flex flex-wrap items-center gap-1.5">
          {row.expiresAt ? formatDate(row.expiresAt) : t('never')}
          {row.isExpired && row.status === 'active' && (
            <StatusPill label={t('expiredTag')} tone="warning" />
          )}
        </span>
      ),
    },
    {
      id: 'lastUsedAt',
      header: t('columns.lastUsed'),
      isSortable: true,
      cell: (row) =>
        row.lastUsedAt ? format.relativeTime(new Date(row.lastUsedAt)) : t('neverUsed'),
    },
    {
      id: 'status',
      header: t('columns.status'),
      cell: (row) => {
        const status = getApiKeyRowStatus(row)
        // an expired key is still active, and the Expires column already tags it
        const shown = status === 'expired' ? 'active' : status
        return <StatusPill label={t(`status.${shown}`)} tone={STATUS_TONE[shown]} />
      },
    },
  ]

  const rowActions = (row: ApiKeyDto) => {
    if (row.status !== 'active') return null
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t('rowActions', { name: row.name })}>
            <Ellipsis aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              onAction(API_KEY_DIALOG.RENAME, row)
            }}
          >
            {t('actions.rename')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive"
            onSelect={() => {
              onAction(API_KEY_DIALOG.REVOKE, row)
            }}
          >
            {t('actions.revoke')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      labels={{ caption: t('tableLabel'), actions: t('columns.actions') }}
      sort={toSortParam(sort)}
      onSortChange={(next) => {
        onSortChange(next.desc ? `-${next.id}` : next.id)
      }}
      rowActions={canManage ? rowActions : undefined}
      isLoading={isLoading}
      emptyState={emptyState}
    />
  )
}
