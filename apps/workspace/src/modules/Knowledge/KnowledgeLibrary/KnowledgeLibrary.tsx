// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { BookOpen, Plus } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

import { ROUTES } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import type { KnowledgeBaseDto } from '@surefy/contracts'
import {
  DataTable,
  DataTableSearch,
  DataTableToolbar,
  EmptyState,
  StatCard,
  StatusPill,
  Tag,
} from '@surefy/ui/components/DataDisplay'
import type { DataTableColumn } from '@surefy/ui/components/DataDisplay'
import { ErrorState, ProgressBar } from '@surefy/ui/components/Feedback'
import { SegmentedControl, SelectInput } from '@surefy/ui/components/Forms'
import { PageHeader } from '@surefy/ui/components/Layout'
import { LoadMore } from '@surefy/ui/components/Navigation'
import { Button } from '@surefy/ui/primitives/button'

import { BASE_FILTERS, LIBRARY_VIEWS } from '../Knowledge.constants'
import { getBaseStatus, toBaseSort } from '../Knowledge.utils'
import CreateKnowledgeBaseDialog from './CreateKnowledgeBaseDialog'
import { useKnowledgeLibraryController } from './KnowledgeLibrary.controller'
import RecentlyDeletedKnowledge from './RecentlyDeletedKnowledge'

import type { BaseFilter, BaseSort } from '../Knowledge.constants'

const toSort = (sort: BaseSort) => ({ id: sort.replace(/^-/, ''), desc: sort.startsWith('-') })

/** Knowledge: the KPIs and the table of knowledge bases, with New knowledge base and Recently deleted. */
export default function KnowledgeLibrary() {
  const c = useKnowledgeLibraryController()
  const { t } = c
  const { orgSlug } = useParams<{ orgSlug: string }>()

  const status = (base: KnowledgeBaseDto) => {
    const state = getBaseStatus(base)
    switch (state.kind) {
      case 'reindexing': {
        return (
          <ProgressBar
            label={t('status.reindexing')}
            value={state.percent}
            valueText={t('status.reindexingValue', { percent: state.percent })}
          />
        )
      }
      case 'processing': {
        return (
          <ProgressBar
            label={t('status.processing', { count: state.count })}
            value={state.percent}
            valueText={t('status.processingValue', { count: state.count, percent: state.percent })}
          />
        )
      }
      case 'attention': {
        return <StatusPill tone="warning" label={t('status.attention', { count: state.count })} />
      }
      case 'empty': {
        return <StatusPill tone="neutral" label={t('status.empty')} />
      }
      default: {
        return <StatusPill tone="success" label={t('status.ready')} />
      }
    }
  }

  const sources = (base: KnowledgeBaseDto) => {
    const parts = [
      base.sourcesByType.file > 0 && t('sources.files', { count: base.sourcesByType.file }),
      base.sourcesByType.link > 0 && t('sources.links', { count: base.sourcesByType.link }),
      base.sourcesByType.connector > 0 &&
        t('sources.connectors', { count: base.sourcesByType.connector }),
    ].filter(Boolean)
    return parts.length > 0 ? parts.join(' · ') : '—'
  }

  const columns: DataTableColumn<KnowledgeBaseDto>[] = [
    {
      id: 'name',
      header: t('columns.name'),
      isSortable: true,
      isHideable: false,
      cell: (base) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-center gap-2">
            <span className="text-body truncate font-medium">{base.name}</span>
            {base.isLocalOnly && <Tag>{t('localOnly')}</Tag>}
          </span>
          {base.description && (
            <span className="text-caption text-muted-foreground truncate">{base.description}</span>
          )}
        </div>
      ),
    },
    { id: 'sources', header: t('columns.sources'), cell: sources },
    { id: 'status', header: t('columns.status'), cell: status },
    {
      id: 'usedBy',
      header: t('columns.usedBy'),
      align: 'end',
      cell: (base) => (base.usedByCount > 0 ? c.format.number(base.usedByCount) : '—'),
    },
    {
      id: 'access',
      header: t('columns.access'),
      cell: (base) =>
        base.accessTeams.length > 0 ? (
          base.accessTeams.map((team) => team.name).join(', ')
        ) : (
          <span className="text-muted-foreground">{t('noTeamAccess')}</span>
        ),
    },
    {
      id: 'updatedAt',
      header: t('columns.updated'),
      isSortable: true,
      cell: (base) => c.format.relativeTime(new Date(base.updatedAt), c.now),
    },
  ]

  const emptyState = c.hasFilters ? (
    <EmptyState
      icon={BookOpen}
      title={t('noResults.title')}
      description={t('noResults.description')}
      actionLabel={t('noResults.clear')}
      onAction={c.onClearFilters}
    />
  ) : (
    <EmptyState
      icon={BookOpen}
      title={t('empty.title')}
      description={t('empty.description')}
      actionLabel={t('newButton')}
      onAction={c.onCreate}
    />
  )

  const number = (value: number | undefined) => (value === undefined ? '—' : c.format.number(value))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button icon={Plus} onClick={c.onCreate}>
            {t('newButton')}
          </Button>
        }
      />
      <section aria-label={t('kpis.label')} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('kpis.bases')} value={number(c.summary?.knowledgeBases)} />
        <StatCard label={t('kpis.sources')} value={number(c.summary?.sources)} />
        <StatCard label={t('kpis.processing')} value={number(c.summary?.processing)} />
        <StatCard
          label={t('kpis.attention')}
          value={number(c.summary?.needsAttention)}
          href="?filter=attention"
          linkComponent={Link}
        />
      </section>
      {c.canSeeDeleted && (
        <SegmentedControl
          label={t('views.label')}
          options={LIBRARY_VIEWS.map((value) => ({ value, label: t(`views.${value}`) }))}
          value={c.view}
          onValueChange={c.onViewChange}
          className="self-start"
        />
      )}
      {c.view === 'deleted' ? (
        <RecentlyDeletedKnowledge orgId={c.orgId} />
      ) : (
        <>
          <DataTableToolbar>
            <DataTableSearch
              label={t('search.label')}
              placeholder={t('search.placeholder')}
              value={c.params.q}
              onValueChange={c.onSearchChange}
            />
            <SelectInput<BaseFilter>
              aria-label={t('filters.label')}
              options={BASE_FILTERS.map((value) => ({ value, label: t(`filters.${value}`) }))}
              value={c.params.filter}
              onValueChange={c.onFilterChange}
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
                <DataTable
                  columns={columns}
                  data={c.bases}
                  getRowId={(base) => base.id}
                  labels={{ caption: t('tableLabel') }}
                  sort={toSort(c.params.sort)}
                  onSortChange={(next) => {
                    c.onSortChange(toBaseSort(next.id, next.desc))
                  }}
                  getRowHref={(base) => toRoute(ROUTES.workspace.knowledgeBase(orgSlug, base.id))}
                  linkComponent={Link}
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
          </section>
        </>
      )}
      {c.isCreating && <CreateKnowledgeBaseDialog orgId={c.orgId} onClose={c.onCloseCreate} />}
    </div>
  )
}
