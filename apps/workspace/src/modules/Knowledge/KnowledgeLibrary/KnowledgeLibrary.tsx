// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { BookOpen, FileText, Link2, Plus, Table2 } from 'lucide-react'
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
  IconTile,
  MonoTile,
  StatCard,
  StatusPill,
} from '@surefy/ui/components/DataDisplay'
import type { DataTableColumn } from '@surefy/ui/components/DataDisplay'
import { ErrorState, ProgressBar } from '@surefy/ui/components/Feedback'
import { SegmentedControl } from '@surefy/ui/components/Forms'
import { PageHeader } from '@surefy/ui/components/Layout'
import { FilterChips, LoadMore } from '@surefy/ui/components/Navigation'
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
    const kinds = (['file', 'link', 'connector'] as const).filter(
      (kind) => base.sourcesByType[kind] > 0,
    )
    if (kinds.length === 0) return <span className="text-muted-foreground">—</span>
    return (
      <div className="flex flex-col gap-1">
        <span className="text-label font-medium">
          {t('sources.count', { count: base.sourceCount })}
        </span>
        <span className="flex gap-1">
          {kinds.map((kind) => (
            <span
              key={kind}
              className="border-border bg-surface-2 text-foreground-secondary inline-flex h-[1.125rem] items-center rounded-sm border px-1.5 font-mono text-[0.625rem] font-semibold"
            >
              {t(`sources.chips.${kind}`)}
            </span>
          ))}
        </span>
      </div>
    )
  }

  const columns: DataTableColumn<KnowledgeBaseDto>[] = [
    {
      id: 'name',
      header: t('columns.name'),
      isSortable: true,
      isHideable: false,
      cell: (base) => (
        <div className="flex min-w-0 items-center gap-3">
          <IconTile icon={BookOpen} />
          <div className="flex min-w-0 flex-col">
            <span className="flex items-center gap-2">
              <span className="text-body truncate font-semibold">{base.name}</span>
              {base.isLocalOnly && <StatusPill tone="success" label={t('localOnly')} />}
            </span>
            {base.description && (
              <span className="text-caption text-muted-foreground truncate">
                {base.description}
              </span>
            )}
          </div>
        </div>
      ),
    },
    { id: 'sources', header: t('columns.sources'), cell: sources },
    { id: 'status', header: t('columns.status'), cell: status },
    {
      id: 'usedBy',
      header: t('columns.usedBy'),
      cell: (base) =>
        base.usedByCount > 0 ? (
          <span className="bg-surface-2 text-caption text-foreground-secondary inline-flex h-[1.375rem] items-center rounded-full px-2">
            {t('usedByCount', { count: base.usedByCount })}
          </span>
        ) : (
          <span className="text-caption text-muted-foreground">{t('usedByNone')}</span>
        ),
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

  const emptyState = (
    <EmptyState
      icon={BookOpen}
      title={t('noResults.title')}
      description={t('noResults.description')}
      actionLabel={t('noResults.clear')}
      onAction={c.onClearFilters}
    />
  )
  const isFirstTime = !c.isLoading && !c.hasFilters && !c.errorMessage && c.bases.length === 0
  const SUGGESTIONS = [
    { key: 'pdf', icon: FileText },
    { key: 'url', icon: Link2 },
    { key: 'csv', icon: Table2 },
  ] as const

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
      <section aria-label={t('kpis.label')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard size="sm" label={t('kpis.bases')} value={number(c.summary?.knowledgeBases)} />
        <StatCard
          size="sm"
          label={t('kpis.sources')}
          value={number(c.summary?.sources)}
          description={t('kpis.hints.sources')}
        />
        <StatCard
          size="sm"
          label={t('kpis.processing')}
          value={number(c.summary?.processing)}
          description={t('kpis.hints.processing')}
        />
        <StatCard
          size="sm"
          label={t('kpis.attention')}
          value={number(c.summary?.needsAttention)}
          description={t('kpis.hints.attention')}
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
            <FilterChips<BaseFilter>
              label={t('filters.label')}
              options={BASE_FILTERS.map((value) => ({ value, label: t(`filters.${value}`) }))}
              value={c.params.filter}
              onValueChange={c.onFilterChange}
            />
          </DataTableToolbar>
          <section aria-busy={c.isLoading || undefined}>
            {c.errorMessage && (
              <ErrorState
                title={t('loadError')}
                message={c.errorMessage}
                reference={c.errorReference}
                onRetry={c.refetch}
              />
            )}
            {isFirstTime && (
              <div className="flex flex-col gap-3">
                <div className="border-border bg-surface rounded-xl border px-6 py-4">
                  <EmptyState
                    icon={BookOpen}
                    title={t('empty.title')}
                    description={t('empty.description')}
                    actionLabel={t('newButton')}
                    onAction={c.onCreate}
                  />
                </div>
                <ul className="grid gap-3 sm:grid-cols-3">
                  {SUGGESTIONS.map(({ key, icon: Icon }) => (
                    <li
                      key={key}
                      className="border-border bg-surface flex items-center gap-3 rounded-xl border px-4 py-3"
                    >
                      <MonoTile size="lg">{key.toUpperCase()}</MonoTile>
                      <span className="flex min-w-0 flex-col">
                        <span className="text-label font-semibold">
                          {t(`empty.suggestions.${key}.title`)}
                        </span>
                        <span className="text-caption text-muted-foreground">
                          {t(`empty.suggestions.${key}.description`)}
                        </span>
                      </span>
                      <Icon aria-hidden className="text-muted-foreground ml-auto size-4 shrink-0" />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!c.errorMessage && !isFirstTime && (
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
