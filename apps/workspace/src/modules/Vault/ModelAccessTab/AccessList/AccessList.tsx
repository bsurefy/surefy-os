// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTranslations } from 'next-intl'

import type { ModelAccessEntryDto } from '@surefy/contracts'
import { DataTable, StatusPill } from '@surefy/ui/components/DataDisplay'
import type { DataTableColumn } from '@surefy/ui/components/DataDisplay'
import { MultiSelect } from '@surefy/ui/components/Forms'
import type { ComboboxOption } from '@surefy/ui/components/Forms'

import { getProviderName, toAccessValues } from '../../Vault.utils'

import type { ReactNode } from 'react'

export interface AccessListProps {
  entries: ModelAccessEntryDto[]
  options: ComboboxOption[]
  isLoading: boolean
  emptyState: ReactNode
  onChange: (entry: ModelAccessEntryDto, values: string[]) => void
}

/** One row per model with a searchable multi-select of the teams and people who may use it. */
export default function AccessList({
  entries,
  options,
  isLoading,
  emptyState,
  onChange,
}: Readonly<AccessListProps>) {
  const t = useTranslations('vault.modelAccess')

  const columns: DataTableColumn<ModelAccessEntryDto>[] = [
    {
      id: 'model',
      header: t('columns.model'),
      isHideable: false,
      width: '16rem',
      cell: (entry) => (
        <div className="flex min-w-0 flex-col items-start gap-1">
          <span className="text-body truncate font-medium">{entry.displayName}</span>
          <span className="text-caption text-muted-foreground truncate">
            {getProviderName(entry.providerKey)} · {t(`type.${entry.type}`)}
          </span>
          {!entry.isEnabled && <StatusPill label={t('disabled')} tone="neutral" />}
        </div>
      ),
    },
    {
      id: 'access',
      header: t('columns.access'),
      cell: (entry) => (
        <MultiSelect
          aria-label={t('accessLabel', { model: entry.displayName })}
          options={options}
          value={toAccessValues(entry.rules)}
          onValueChange={(values) => {
            onChange(entry, values)
          }}
          labels={{
            placeholder: t('nobody'),
            search: t('searchSubjects'),
            empty: t('noSubjects'),
            remove: (label) => t('removeSubject', { name: label }),
            more: (count) => t('moreSubjects', { count }),
          }}
        />
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      data={entries}
      getRowId={(entry) => entry.modelId}
      labels={{ caption: t('tableLabel') }}
      isLoading={isLoading}
      emptyState={emptyState}
    />
  )
}
