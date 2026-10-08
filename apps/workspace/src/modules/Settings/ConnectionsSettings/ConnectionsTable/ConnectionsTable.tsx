// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Ellipsis } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'

import type { ConnectionDto } from '@surefy/contracts'
import { DataTable, MonoTile, StatusPill } from '@surefy/ui/components/DataDisplay'
import type { DataTableColumn } from '@surefy/ui/components/DataDisplay'
import { Button } from '@surefy/ui/primitives/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@surefy/ui/primitives/dropdown-menu'

import { CONNECTION_DIALOG } from '../ConnectionsSettings.constants'
import {
  getReasonKey,
  getRowActions,
  maskSecret,
  needsAttention,
  toSortParam,
} from '../ConnectionsSettings.utils'

import type { ConnectionsTableProps } from './ConnectionsTable.types'

const STATUS_TONE = {
  active: 'success',
  expired: 'warning',
  error: 'destructive',
  revoked: 'neutral',
} as const
const TILE_CHARS = 2

/** The connections table: the app and account, what it is used for, who can use it and how it is doing. */
export default function ConnectionsTable({
  rows,
  isLoading,
  sort,
  onSortChange,
  emptyState,
  canManage,
  userId,
  isOnline,
  providerName,
  testingId,
  onAction,
  onTest,
}: Readonly<ConnectionsTableProps>) {
  const t = useTranslations('settings.connections')
  const format = useFormatter()
  const formatDate = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium' })

  const scopeCell = (row: ConnectionDto) => {
    if (row.scope === 'personal') {
      return row.owner && canManage
        ? t('scope.personalOwner', { owner: row.owner.name })
        : t('scope.personal')
    }
    if (row.scope === 'team') return row.team?.name ?? t('scope.team')
    return t('scope.organization')
  }

  const columns: DataTableColumn<ConnectionDto>[] = [
    {
      id: 'name',
      header: t('columns.connection'),
      isSortable: true,
      isHideable: false,
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          <MonoTile size="lg">{providerName(row.providerKey).slice(0, TILE_CHARS)}</MonoTile>
          <div className="flex min-w-0 flex-col">
            <span className="text-body truncate font-medium">{row.name}</span>
            <span className="text-caption text-muted-foreground truncate">
              {row.externalAccountLabel ?? maskSecret(row.secretLast4) ?? row.baseUrl ?? (
                <>{providerName(row.providerKey)}</>
              )}
            </span>
          </div>
        </div>
      ),
    },
    {
      id: 'kind',
      header: t('columns.usedFor'),
      cell: (row) => t(`kinds.${row.kind}`),
    },
    ...(canManage
      ? [
          {
            id: 'scope',
            header: t('columns.whoCanUse'),
            cell: scopeCell,
          },
          {
            id: 'createdAt',
            header: t('columns.connectedBy'),
            isSortable: true,
            cell: (row: ConnectionDto) => (
              <div className="flex min-w-0 flex-col">
                <span className="text-body truncate">
                  {row.connectedBy?.name ?? t('formerMember')}
                </span>
                <span className="text-caption text-muted-foreground">
                  {formatDate(row.createdAt)}
                </span>
              </div>
            ),
          },
        ]
      : []),
    {
      id: 'usedBy',
      header: t('columns.usedBy'),
      cell: (row) =>
        row.usedByCount > 0 ? (
          <Button
            variant="link"
            className="h-auto p-0"
            onClick={() => {
              onAction(CONNECTION_DIALOG.USED_BY, row)
            }}
          >
            {t('usedByCount', { count: row.usedByCount })}
          </Button>
        ) : (
          <span className="text-muted-foreground">{t('usedByNone')}</span>
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
        const reasonKey = getReasonKey(row.statusReasonCode)
        const actions = getRowActions(row, { canManage, userId })
        return (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-0 flex-col items-start gap-0.5">
              <StatusPill label={t(`status.${row.status}`)} tone={STATUS_TONE[row.status]} />
              {needsAttention(row) && reasonKey && (
                <span className="text-caption text-muted-foreground">
                  {t(`reasons.${reasonKey}`)}
                </span>
              )}
            </div>
            {needsAttention(row) && actions.reconnect && (
              <Button
                size="sm"
                variant="secondary"
                disabled={!isOnline}
                onClick={() => {
                  onAction(CONNECTION_DIALOG.RECONNECT, row)
                }}
              >
                {t('actions.reconnect')}
              </Button>
            )}
          </div>
        )
      },
    },
  ]

  const rowActions = (row: ConnectionDto) => {
    const actions = getRowActions(row, { canManage, userId })
    if (!actions.test) return null
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t('rowActions', { name: row.name })}>
            <Ellipsis aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={testingId === row.id}
            onSelect={() => {
              onTest(row)
            }}
          >
            {t('actions.test')}
          </DropdownMenuItem>
          {actions.reconnect && (
            <DropdownMenuItem
              disabled={!isOnline}
              onSelect={() => {
                onAction(CONNECTION_DIALOG.RECONNECT, row)
              }}
            >
              {t('actions.reconnect')}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={() => {
              onAction(CONNECTION_DIALOG.RENAME, row)
            }}
          >
            {actions.editAddress ? t('actions.renameAndAddress') : t('actions.rename')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive"
            disabled={!isOnline}
            onSelect={() => {
              onAction(CONNECTION_DIALOG.DISCONNECT, row)
            }}
          >
            {t('actions.disconnect')}
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
      rowActions={rowActions}
      isLoading={isLoading}
      emptyState={emptyState}
    />
  )
}
