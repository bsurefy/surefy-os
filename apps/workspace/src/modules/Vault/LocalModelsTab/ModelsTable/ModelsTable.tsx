// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useFormatter, useTranslations } from 'next-intl'

import type { VaultModelDto } from '@surefy/contracts'
import { DataTable, StatusPill } from '@surefy/ui/components/DataDisplay'
import type { DataTableColumn } from '@surefy/ui/components/DataDisplay'
import { Switch } from '@surefy/ui/primitives/switch'

import type { ReactNode } from 'react'

export interface ModelsTableProps {
  models: VaultModelDto[]
  isLoading: boolean
  emptyState: ReactNode
  onToggle: (model: VaultModelDto, isEnabled: boolean) => void
}

/** The models of the local servers: type, context window, availability and the enable switch. */
export default function ModelsTable({
  models,
  isLoading,
  emptyState,
  onToggle,
}: Readonly<ModelsTableProps>) {
  const t = useTranslations('vault.models')
  const format = useFormatter()

  const columns: DataTableColumn<VaultModelDto>[] = [
    {
      id: 'name',
      header: t('columns.name'),
      isHideable: false,
      cell: (model) => (
        <div className="flex min-w-0 flex-col">
          <span className="text-body truncate font-medium">{model.displayName}</span>
          <span className="text-caption text-muted-foreground truncate">
            {model.server ? t('onServer', { name: model.server.name }) : model.providerKey}
          </span>
        </div>
      ),
    },
    { id: 'type', header: t('columns.type'), cell: (model) => t(`type.${model.type}`) },
    {
      id: 'context',
      header: t('columns.context'),
      align: 'end',
      cell: (model) => (model.contextWindow ? format.number(model.contextWindow) : '—'),
    },
    {
      id: 'status',
      header: t('columns.status'),
      cell: (model) => {
        if (model.status === 'available') return null
        return (
          <StatusPill
            label={t(`status.${model.status}`)}
            tone={model.status === 'unavailable' ? 'warning' : 'destructive'}
          />
        )
      },
    },
    {
      id: 'enabled',
      header: t('columns.enabled'),
      align: 'end',
      cell: (model) => (
        <Switch
          checked={model.isEnabled}
          aria-label={t('enable', { name: model.displayName })}
          onCheckedChange={(checked) => {
            onToggle(model, checked)
          }}
        />
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      data={models}
      getRowId={(model) => model.id}
      labels={{ caption: t('tableLabel') }}
      isLoading={isLoading}
      emptyState={emptyState}
    />
  )
}
