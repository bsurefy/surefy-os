// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Bot, Plus } from 'lucide-react'
import Link from 'next/link'

import { ROUTES } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import type { AgentDto } from '@surefy/contracts'
import { DataTableSearch, DataTableToolbar, EmptyState } from '@surefy/ui/components/DataDisplay'
import { Banner, ErrorState, SkeletonCard } from '@surefy/ui/components/Feedback'
import { SegmentedControl, SelectInput } from '@surefy/ui/components/Forms'
import { PageHeader } from '@surefy/ui/components/Layout'
import { FilterChips, LoadMore } from '@surefy/ui/components/Navigation'
import { Button } from '@surefy/ui/primitives/button'

import { TemplatePicker } from '../AgentTemplates'
import AgentActionDialog from './AgentActionDialog'
import AgentCard from './AgentCard'
import { AGENT_FILTERS, AGENT_OWNERS, AGENT_SORTS, AGENT_VIEWS } from './AgentsList.constants'
import { useAgentsListController } from './AgentsList.controller'
import AgentsTable from './AgentsTable'

import type { AgentFilter, AgentOwner, AgentSort, AgentView } from './AgentsList.constants'

const SKELETON_COUNT = 6

/**
 * Agents: the toolbar (search, status, owner, sort, cards or table), the agents with their
 * "⋯" menus, "Needs attention", and the first-time state with the templates.
 */
export default function AgentsList() {
  const c = useAgentsListController()
  const { t } = c
  const getHref = (agent: AgentDto) => toRoute(ROUTES.workspace.agent(c.orgSlug, agent.id))
  const isFirstTime = !c.isLoading && !c.hasFilters && !c.errorMessage && c.agents.length === 0

  const emptyState = (
    <EmptyState
      icon={Bot}
      title={t('noResults.title')}
      description={t('noResults.description')}
      actionLabel={t('noResults.clear')}
      onAction={c.onClearFilters}
    />
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href={toRoute(ROUTES.workspace.agentNew(c.orgSlug))}>
                {t('browseTemplates')}
              </Link>
            </Button>
            {c.canCreate && (
              <Button icon={Plus} isLoading={c.isCreating} onClick={() => void c.onCreate()}>
                {t('createButton')}
              </Button>
            )}
          </>
        }
      />
      {c.createError && (
        <Banner
          tone="destructive"
          title={t('createError')}
          description={c.createError}
          onDismiss={c.onDismissCreateError}
          isAnnounced
        />
      )}
      {isFirstTime ? (
        <section className="flex flex-col gap-4">
          <div className="border-border bg-surface rounded-xl border px-6 py-4">
            <EmptyState icon={Bot} title={t('empty.title')} description={t('empty.description')} />
          </div>
          <TemplatePicker />
        </section>
      ) : (
        <>
          <DataTableToolbar>
            <DataTableSearch
              label={t('search.label')}
              placeholder={t('search.placeholder')}
              value={c.params.q}
              onValueChange={c.onSearchChange}
            />
            <FilterChips<AgentFilter>
              label={t('filters.label')}
              options={AGENT_FILTERS.map((value) => ({ value, label: t(`filters.${value}`) }))}
              value={c.params.filter}
              onValueChange={c.onFilterChange}
            />
            <SelectInput<AgentOwner>
              aria-label={t('owner.label')}
              options={AGENT_OWNERS.map((value) => ({ value, label: t(`owner.${value}`) }))}
              value={c.params.owner}
              onValueChange={c.onOwnerChange}
            />
            <SelectInput<AgentSort>
              aria-label={t('sort.label')}
              options={AGENT_SORTS.map((value) => ({ value, label: t(`sort.${value}`) }))}
              value={c.params.sort}
              onValueChange={c.onSortChange}
            />
            <SegmentedControl<AgentView>
              label={t('views.label')}
              options={AGENT_VIEWS.map((value) => ({ value, label: t(`views.${value}`) }))}
              value={c.params.view}
              onValueChange={c.onViewChange}
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
            {!c.errorMessage && c.params.view === 'cards' && (
              <>
                {c.isLoading ? (
                  <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: SKELETON_COUNT }, (_, index) => (
                      <li key={index}>
                        <SkeletonCard />
                      </li>
                    ))}
                  </ul>
                ) : (
                  c.agents.length === 0 && emptyState
                )}
                {c.agents.length > 0 && (
                  <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {c.agents.map((agent) => (
                      <AgentCard
                        key={agent.id}
                        agent={agent}
                        href={getHref(agent)}
                        thresholds={c.thresholds}
                        canCreate={c.canCreate}
                        onAction={c.actions.onAction}
                      />
                    ))}
                  </ul>
                )}
              </>
            )}
            {!c.errorMessage && c.params.view === 'table' && (
              <AgentsTable
                agents={c.agents}
                isLoading={c.isLoading}
                sort={c.params.sort}
                onSortChange={c.onSortChange}
                getHref={getHref}
                thresholds={c.thresholds}
                canCreate={c.canCreate}
                onAction={c.actions.onAction}
                emptyState={emptyState}
              />
            )}
            {!c.errorMessage && (
              <LoadMore
                label={t('loadMore')}
                onLoadMore={c.onLoadMore}
                isLoading={c.isLoadingMore}
                hasMore={c.hasMore}
              />
            )}
          </section>
        </>
      )}
      {c.actions.dialog && (
        <AgentActionDialog
          orgId={c.orgId}
          action={c.actions.dialog.action}
          agent={c.actions.dialog.agent}
          onClose={c.actions.onCloseDialog}
        />
      )}
    </div>
  )
}
