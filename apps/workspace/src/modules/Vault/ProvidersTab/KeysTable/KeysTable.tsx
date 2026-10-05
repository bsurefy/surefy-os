// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useFormatter, useTranslations } from 'next-intl'

import type { CredentialDto } from '@surefy/contracts'
import { DataTable, StatusPill } from '@surefy/ui/components/DataDisplay'
import type { DataTableColumn } from '@surefy/ui/components/DataDisplay'
import { DropdownMenuItem, DropdownMenuSeparator } from '@surefy/ui/primitives/dropdown-menu'

import RowMenu from '../../RowMenu'
import { getExpiringDays, getMaskedValue, getProviderName, getStatusTone } from '../../Vault.utils'
import { KEY_DIALOG } from '../ProvidersTab.constants'

import type { KeyDialogKind } from '../ProvidersTab.constants'
import type { ReactNode } from 'react'

export interface KeysTableProps {
  keys: CredentialDto[]
  now: number
  isLoading: boolean
  emptyState: ReactNode
  /** The key being tested right now, to disable its menu item. */
  testingId?: string
  onTest: (credential: CredentialDto) => void
  onAction: (kind: KeyDialogKind, credential: CredentialDto) => void
}

/** The keys table: name, provider, masked value, scope, who added it, last use, spend and status. */
export default function KeysTable({
  keys,
  now,
  isLoading,
  emptyState,
  testingId,
  onTest,
  onAction,
}: Readonly<KeysTableProps>) {
  const t = useTranslations('vault.keys')
  const tErrors = useTranslations('errors')
  const format = useFormatter()

  const scopeLabel = (key: CredentialDto): string => {
    if (key.scope === 'team') return key.team?.name ?? t('scope.team')
    if (key.scope === 'personal') return t('scope.personal', { name: key.owner?.name ?? '' })
    return t('scope.organization')
  }

  const columns: DataTableColumn<CredentialDto>[] = [
    {
      id: 'name',
      header: t('columns.name'),
      isHideable: false,
      cell: (key) => (
        <div className="flex min-w-0 flex-col">
          <span className="text-body truncate font-medium">{key.name}</span>
          {key.replacedBy && (
            <span className="text-caption text-warning">
              {t('replacedBy', { name: key.replacedBy.name })}
            </span>
          )}
          {key.rotatedFromId && !key.isPrimary && key.status !== 'revoked' && (
            <span className="text-caption text-muted-foreground">{t('replacementNotInUse')}</span>
          )}
        </div>
      ),
    },
    {
      id: 'provider',
      header: t('columns.provider'),
      cell: (key) => getProviderName(key.providerKey),
    },
    {
      id: 'value',
      header: t('columns.value'),
      cell: (key) => <span className="font-mono">{getMaskedValue(key.secretLast4)}</span>,
    },
    { id: 'scope', header: t('columns.scope'), cell: scopeLabel },
    {
      id: 'createdBy',
      header: t('columns.createdBy'),
      cell: (key) => key.createdBy?.name ?? '—',
    },
    {
      id: 'lastUsed',
      header: t('columns.lastUsed'),
      cell: (key) => (key.lastUsedAt ? format.relativeTime(new Date(key.lastUsedAt)) : t('never')),
    },
    {
      id: 'spend',
      header: t('columns.spend'),
      align: 'end',
      cell: (key) =>
        key.spendThisMonth.length === 0
          ? '—'
          : key.spendThisMonth
              .map((spend) =>
                format.number(spend.costMicros / 1_000_000, {
                  style: 'currency',
                  currency: spend.currency,
                }),
              )
              .join(', '),
    },
    {
      id: 'status',
      header: t('columns.status'),
      cell: (key) => {
        const days = getExpiringDays(key, now)
        return (
          <div className="flex flex-col items-start gap-1">
            <StatusPill label={t(`status.${key.status}`)} tone={getStatusTone(key.status)} />
            {key.statusReasonCode && key.status !== 'active' && (
              <span className="text-caption text-muted-foreground max-w-56">
                {tErrors(key.statusReasonCode)}
              </span>
            )}
            {days !== null && (
              <span className="text-caption text-warning">{t('expiresIn', { days })}</span>
            )}
          </div>
        )
      },
    },
  ]

  const rowActions = (key: CredentialDto) => {
    if (key.status === 'revoked') return null
    return (
      <RowMenu label={t('rowActions', { name: key.name })}>
        <DropdownMenuItem
          disabled={testingId === key.id}
          onSelect={() => {
            onTest(key)
          }}
        >
          {t('actions.test')}
        </DropdownMenuItem>
        {key.scope !== 'personal' && (
          <DropdownMenuItem
            onSelect={() => {
              onAction(KEY_DIALOG.ROTATE, key)
            }}
          >
            {t('actions.rotate')}
          </DropdownMenuItem>
        )}
        {key.rotatedFromId && !key.isPrimary && (
          <DropdownMenuItem
            onSelect={() => {
              onAction(KEY_DIALOG.SWITCH, key)
            }}
          >
            {t('actions.switch')}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive"
          onSelect={() => {
            onAction(KEY_DIALOG.REVOKE, key)
          }}
        >
          {t('actions.revoke')}
        </DropdownMenuItem>
      </RowMenu>
    )
  }

  return (
    <DataTable
      columns={columns}
      data={keys}
      getRowId={(key) => key.id}
      labels={{ caption: t('tableLabel'), actions: t('columns.actions') }}
      rowActions={rowActions}
      isLoading={isLoading}
      emptyState={emptyState}
    />
  )
}
