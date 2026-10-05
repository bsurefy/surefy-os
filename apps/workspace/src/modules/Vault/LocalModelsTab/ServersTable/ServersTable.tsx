// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useFormatter, useTranslations } from 'next-intl'

import type { CredentialDto } from '@surefy/contracts'
import { DataTable, StatusPill } from '@surefy/ui/components/DataDisplay'
import type { DataTableColumn } from '@surefy/ui/components/DataDisplay'
import { DropdownMenuItem, DropdownMenuSeparator } from '@surefy/ui/primitives/dropdown-menu'

import RowMenu from '../../RowMenu'
import { getProviderName, getStatusTone } from '../../Vault.utils'

import type { ReactNode } from 'react'

export interface ServersTableProps {
  servers: CredentialDto[]
  isLoading: boolean
  emptyState: ReactNode
  testingId?: string
  syncingId?: string
  onTest: (server: CredentialDto) => void
  onSync: (server: CredentialDto) => void
  onRemove: (server: CredentialDto) => void
}

/** The local servers: address, status with the last contact when offline, models served, scope. */
export default function ServersTable({
  servers,
  isLoading,
  emptyState,
  testingId,
  syncingId,
  onTest,
  onSync,
  onRemove,
}: Readonly<ServersTableProps>) {
  const t = useTranslations('vault.servers')
  const format = useFormatter()

  const columns: DataTableColumn<CredentialDto>[] = [
    {
      id: 'name',
      header: t('columns.name'),
      isHideable: false,
      cell: (server) => (
        <div className="flex min-w-0 flex-col">
          <span className="text-body truncate font-medium">{server.name}</span>
          {server.baseUrl && (
            <span className="text-caption text-muted-foreground truncate font-mono">
              {server.baseUrl}
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'type',
      header: t('columns.type'),
      cell: (server) => getProviderName(server.providerKey),
    },
    {
      id: 'status',
      header: t('columns.status'),
      cell: (server) => (
        <div className="flex flex-col items-start gap-1">
          <StatusPill label={t(`status.${server.status}`)} tone={getStatusTone(server.status)} />
          {server.status !== 'active' && (
            <span className="text-caption text-muted-foreground max-w-60">
              {server.lastSuccessAt
                ? t('lastContact', {
                    when: format.relativeTime(new Date(server.lastSuccessAt)),
                    url: server.baseUrl ?? '',
                  })
                : t('neverReached', { url: server.baseUrl ?? '' })}
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'models',
      header: t('columns.models'),
      align: 'end',
      cell: (server) => format.number(server.modelCount ?? 0),
    },
    {
      id: 'scope',
      header: t('columns.scope'),
      cell: (server) =>
        server.scope === 'team' ? (server.team?.name ?? t('scope.team')) : t('scope.organization'),
    },
  ]

  return (
    <DataTable
      columns={columns}
      data={servers}
      getRowId={(server) => server.id}
      labels={{ caption: t('tableLabel'), actions: t('columns.actions') }}
      isLoading={isLoading}
      emptyState={emptyState}
      rowActions={(server) => (
        <RowMenu label={t('rowActions', { name: server.name })}>
          <DropdownMenuItem
            disabled={testingId === server.id}
            onSelect={() => {
              onTest(server)
            }}
          >
            {t('actions.test')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={syncingId === server.id}
            onSelect={() => {
              onSync(server)
            }}
          >
            {t('actions.sync')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive"
            onSelect={() => {
              onRemove(server)
            }}
          >
            {t('actions.remove')}
          </DropdownMenuItem>
        </RowMenu>
      )}
    />
  )
}
