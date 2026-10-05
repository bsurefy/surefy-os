// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { ShieldCheck } from 'lucide-react'

import { DataTableSearch, DataTableToolbar, EmptyState } from '@surefy/ui/components/DataDisplay'
import { Banner, ErrorState } from '@surefy/ui/components/Feedback'
import { SegmentedControl } from '@surefy/ui/components/Forms'
import { Section } from '@surefy/ui/components/Layout'
import { LoadMore } from '@surefy/ui/components/Navigation'

import RemoveAccessDialog from '../ModelDialogs/RemoveAccessDialog'
import { ACCESS_VIEW } from '../Vault.constants'
import AccessList from './AccessList'
import AccessMatrix from './AccessMatrix'
import EmbeddingModelSection from './EmbeddingModelSection'
import { useModelAccessTabController } from './ModelAccessTab.controller'

/** Vault › Model access: the embedding model, and per model who may use it (list or matrix). */
export default function ModelAccessTab() {
  const c = useModelAccessTabController()
  const { t } = c

  const emptyState =
    c.q === '' ? (
      <EmptyState
        icon={ShieldCheck}
        title={t('empty.title')}
        description={t('empty.description')}
      />
    ) : (
      <EmptyState
        icon={ShieldCheck}
        title={t('noResults.title')}
        description={t('noResults.description')}
      />
    )

  return (
    <div className="flex flex-col gap-6">
      <EmbeddingModelSection
        current={c.embedding.current}
        options={c.embedding.options}
        isLoading={c.embedding.isLoading}
        isSaving={c.embedding.isSaving}
        onChange={c.embedding.onChange}
      />
      <Section title={t('title')} description={t('description')}>
        <div className="flex flex-col gap-4">
          <DataTableToolbar>
            <DataTableSearch
              label={t('search.label')}
              placeholder={t('search.placeholder')}
              value={c.q}
              onValueChange={c.onSearchChange}
            />
            <SegmentedControl
              label={t('view.label')}
              size="sm"
              options={[
                { value: ACCESS_VIEW.LIST, label: t('view.list') },
                { value: ACCESS_VIEW.MATRIX, label: t('view.matrix') },
              ]}
              value={c.view}
              onValueChange={c.onViewChange}
            />
          </DataTableToolbar>
          {c.view === ACCESS_VIEW.MATRIX && c.hasMoreTeams && (
            <Banner tone="info" title={t('matrix.limited')} />
          )}
          {c.errorMessage ? (
            <ErrorState
              size="sm"
              title={t('loadError')}
              message={c.errorMessage}
              reference={c.errorReference}
              onRetry={c.refetch}
            />
          ) : (
            <>
              {c.view === ACCESS_VIEW.LIST ? (
                <AccessList
                  entries={c.entries}
                  options={c.accessOptions}
                  isLoading={c.isLoading}
                  emptyState={emptyState}
                  onChange={c.changeAccess}
                />
              ) : (
                <AccessMatrix
                  entries={c.entries}
                  teams={c.teams}
                  isLoading={c.isLoading}
                  emptyState={emptyState}
                  onChange={c.changeAccess}
                />
              )}
              <LoadMore
                label={t('loadMore')}
                onLoadMore={c.onLoadMore}
                isLoading={c.isLoadingMore}
                hasMore={c.hasMore}
              />
            </>
          )}
        </div>
      </Section>
      {c.removal && (
        <RemoveAccessDialog orgId={c.orgId} request={c.removal} onClose={c.closeRemoval} />
      )}
    </div>
  )
}
