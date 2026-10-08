// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Plug, Plus, SearchX } from 'lucide-react'

import { DataTableSearch, DataTableToolbar, EmptyState } from '@surefy/ui/components/DataDisplay'
import { Banner, ErrorState } from '@surefy/ui/components/Feedback'
import { SelectInput } from '@surefy/ui/components/Forms'
import { PageHeader } from '@surefy/ui/components/Layout'
import { LoadMore } from '@surefy/ui/components/Navigation'
import { Button } from '@surefy/ui/primitives/button'

import ConnectionDialogs from './ConnectionDialogs'
import { ANY_FILTER, CONNECTION_DIALOG } from './ConnectionsSettings.constants'
import { useConnectionsSettingsController } from './ConnectionsSettings.controller'
import ConnectionsTable from './ConnectionsTable'

import type { ConnectionKindFilter, ConnectionScopeFilter } from './ConnectionsSettings.types'

/** Settings › Connections: accounts in other apps that agents, knowledge sources and channels use. */
export default function ConnectionsSettings() {
  const c = useConnectionsSettingsController()
  const { t } = c

  const openAdd = () => {
    c.openDialog({ kind: CONNECTION_DIALOG.ADD })
  }

  const emptyState = c.hasFilters ? (
    <EmptyState
      icon={SearchX}
      title={t('noResults.title')}
      description={t('noResults.description')}
      actionLabel={t('noResults.clear')}
      onAction={c.onClearFilters}
    />
  ) : (
    <EmptyState
      icon={Plug}
      title={t('empty.title')}
      description={t('empty.description')}
      actionLabel={t('add.open')}
      onAction={c.isOnline ? openAdd : undefined}
    />
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button icon={Plus} onClick={openAdd} disabled={!c.isOnline}>
            {t('add.open')}
          </Button>
        }
      />
      {!c.isOnline && <Banner tone="info" title={t('offline')} isAnnounced />}
      {c.attentionCount > 0 && (
        <Banner
          tone="warning"
          title={t('banner.title', { count: c.attentionCount })}
          action={
            c.filters.status === 'attention' ? undefined : (
              <Button variant="link" size="sm" onClick={c.onShowAttention}>
                {t('banner.show')}
              </Button>
            )
          }
        />
      )}
      <DataTableToolbar>
        <DataTableSearch
          label={t('search.label')}
          placeholder={t('search.placeholder')}
          value={c.filters.q}
          onValueChange={c.onSearchChange}
        />
        <SelectInput
          aria-label={t('filters.app')}
          options={c.appOptions}
          value={c.filters.app ?? ANY_FILTER}
          onValueChange={(app) => void c.onFiltersChange({ app: app === ANY_FILTER ? null : app })}
          className="w-44"
        />
        <SelectInput
          aria-label={t('filters.kind')}
          options={c.kindOptions}
          value={c.filters.kind ?? ANY_FILTER}
          onValueChange={(kind) =>
            void c.onFiltersChange({
              kind: kind === ANY_FILTER ? null : (kind as ConnectionKindFilter),
            })
          }
          className="w-44"
        />
        {c.canManage && (
          <SelectInput
            aria-label={t('filters.scope')}
            options={c.scopeOptions}
            value={c.filters.scope ?? ANY_FILTER}
            onValueChange={(scope) =>
              void c.onFiltersChange({
                scope: scope === ANY_FILTER ? null : (scope as ConnectionScopeFilter),
              })
            }
            className="w-44"
          />
        )}
        <SelectInput
          aria-label={t('filters.status')}
          options={c.statusOptions}
          value={c.filters.status}
          onValueChange={(status) => void c.onFiltersChange({ status })}
          className="w-44"
        />
      </DataTableToolbar>
      <section aria-busy={c.isLoading || undefined}>
        {c.errorMessage ? (
          <ErrorState
            title={t('loadError')}
            message={c.errorMessage}
            reference={c.errorReference}
            onRetry={c.refetch}
          />
        ) : (
          <>
            <ConnectionsTable
              rows={c.rows}
              isLoading={c.isLoading}
              sort={c.filters.sort}
              onSortChange={(sort) =>
                void c.onFiltersChange({ sort: sort as typeof c.filters.sort })
              }
              emptyState={emptyState}
              canManage={c.canManage}
              userId={c.userId}
              isOnline={c.isOnline}
              providerName={c.providerName}
              testingId={c.testingId}
              onTest={(connection) => void c.onTest(connection)}
              onAction={(kind, connection) => {
                c.openDialog({ kind, connection })
              }}
            />
            <LoadMore
              label={t('loadMore')}
              onLoadMore={c.onLoadMore}
              isLoading={c.isLoadingMore}
              hasMore={c.hasMore}
            />
          </>
        )}
      </section>
      <ConnectionDialogs
        orgId={c.orgId}
        dialog={c.dialog}
        canManage={c.canManage}
        providerName={c.providerName}
        onClose={c.closeDialog}
      />
    </div>
  )
}
