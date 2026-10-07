// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Boxes } from 'lucide-react'
import { useFormatter } from 'next-intl'

import type { UsableModelDto } from '@surefy/contracts'
import {
  DataLocationBadge,
  DataTable,
  DataTableSearch,
  DataTableToolbar,
  EmptyState,
} from '@surefy/ui/components/DataDisplay'
import type { DataTableColumn } from '@surefy/ui/components/DataDisplay'
import { ErrorState } from '@surefy/ui/components/Feedback'
import { LoadMore } from '@surefy/ui/components/Navigation'

import { getProviderName } from '../Vault.utils'
import { useModelListController } from './ModelList.controller'

/**
 * Vault for Builders: one read-only list of the models they may use, with the source, where the
 * data goes and the cost tier. No keys, servers or settings.
 */
export default function ModelList() {
  const c = useModelListController()
  const { t } = c
  const format = useFormatter()

  const columns: DataTableColumn<UsableModelDto>[] = [
    {
      id: 'name',
      header: t('columns.model'),
      isHideable: false,
      cell: (model) => (
        <div className="flex min-w-0 flex-col">
          <span className="text-body truncate font-medium">{model.displayName}</span>
          <span className="text-caption text-muted-foreground truncate">
            {getProviderName(model.providerKey)} · {t(`type.${model.type}`)}
          </span>
        </div>
      ),
    },
    { id: 'source', header: t('columns.source'), cell: (model) => t(`source.${model.source}`) },
    {
      id: 'location',
      header: t('columns.location'),
      cell: (model) => (
        <DataLocationBadge
          location={model.dataLocation === 'on_server' ? 'local' : 'provider'}
          label={
            model.dataLocation === 'on_server'
              ? t('location.local')
              : t('location.provider', { provider: getProviderName(model.providerKey) })
          }
        />
      ),
    },
    { id: 'cost', header: t('columns.cost'), cell: (model) => t(`cost.${model.costTier}`) },
    {
      id: 'context',
      header: t('columns.context'),
      align: 'end',
      cell: (model) => (model.contextWindow ? format.number(model.contextWindow) : '—'),
    },
  ]

  const emptyState =
    c.q === '' ? (
      <EmptyState icon={Boxes} title={t('empty.title')} description={t('empty.description')} />
    ) : (
      <EmptyState
        icon={Boxes}
        title={t('noResults.title')}
        description={t('noResults.description')}
        actionLabel={t('noResults.clear')}
        onAction={c.onClearSearch}
      />
    )

  return (
    <div className="flex flex-col gap-4">
      <DataTableToolbar>
        <DataTableSearch
          label={t('search.label')}
          placeholder={t('search.placeholder')}
          value={c.q}
          onValueChange={c.onSearchChange}
        />
      </DataTableToolbar>
      {c.errorMessage ? (
        <ErrorState
          title={t('loadError')}
          message={c.errorMessage}
          reference={c.errorReference}
          onRetry={c.refetch}
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={c.models}
            getRowId={(model) => model.modelKey}
            labels={{ caption: t('tableLabel') }}
            isLoading={c.isLoading}
            emptyState={emptyState}
          />
          <LoadMore
            label={t('loadMore')}
            onLoadMore={c.onLoadMore}
            isLoading={c.isLoadingMore}
            hasMore={c.hasMore}
          />
        </>
      )}
    </div>
  )
}
