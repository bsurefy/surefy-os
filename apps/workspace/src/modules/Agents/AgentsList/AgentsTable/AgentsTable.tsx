// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Bot } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

import type { AgentDto } from '@surefy/contracts'
import { DataTable, IconTile } from '@surefy/ui/components/DataDisplay'
import type { DataTableColumn } from '@surefy/ui/components/DataDisplay'

import {
  AgentAttentionFact,
  AgentLastRunFact,
  AgentModelFact,
  AgentSharedWithFact,
  AgentStatusFact,
  AgentTrustFact,
} from '../AgentFacts'
import AgentRowMenu from '../AgentRowMenu'

import type { AgentSort } from '../AgentsList.constants'
import type { AgentsTableProps } from './AgentsTable.types'

/** The columns that can be sorted, and the sort each one chooses. */
const COLUMN_SORT: Record<string, AgentSort> = {
  name: 'name',
  lastRun: 'lastRun',
  runsThisWeek: 'runs',
}
const SORT_COLUMN: Record<AgentSort, string> = {
  name: 'name',
  lastRun: 'lastRun',
  runs: 'runsThisWeek',
}

/** The agents as a table, with the same facts as the cards. */
export default function AgentsTable({
  agents,
  isLoading,
  sort,
  onSortChange,
  getHref,
  thresholds,
  canCreate,
  onAction,
  emptyState,
}: Readonly<AgentsTableProps>) {
  const t = useTranslations('agents.list')

  const columns: DataTableColumn<AgentDto>[] = [
    {
      id: 'name',
      header: t('columns.name'),
      isSortable: true,
      isHideable: false,
      cell: (agent) => (
        <div className="flex min-w-0 items-center gap-3">
          <IconTile icon={Bot} />
          <div className="flex min-w-0 flex-col">
            <span className="text-body truncate font-semibold">{agent.name}</span>
            {agent.description && (
              <span className="text-caption text-muted-foreground truncate">
                {agent.description}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      id: 'status',
      header: t('columns.status'),
      cell: (agent) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <AgentStatusFact agent={agent} />
          <AgentAttentionFact agent={agent} />
        </span>
      ),
    },
    { id: 'model', header: t('columns.model'), cell: (agent) => <AgentModelFact agent={agent} /> },
    {
      id: 'lastRun',
      header: t('columns.lastRun'),
      isSortable: true,
      cell: (agent) => <AgentLastRunFact agent={agent} />,
    },
    {
      id: 'trust',
      header: t('columns.trust'),
      cell: (agent) => <AgentTrustFact agent={agent} thresholds={thresholds} />,
    },
    {
      id: 'runsThisWeek',
      header: t('columns.runsThisWeek'),
      isSortable: true,
      cell: (agent) => t('runsCount', { count: agent.runsThisWeek }),
    },
    {
      id: 'approvals',
      header: t('columns.approvals'),
      cell: (agent) => (agent.approvalsWaiting > 0 ? agent.approvalsWaiting : '—'),
    },
    {
      id: 'sharedWith',
      header: t('columns.sharedWith'),
      cell: (agent) => <AgentSharedWithFact agent={agent} />,
    },
    {
      id: 'owner',
      header: t('columns.owner'),
      cell: (agent) => agent.owner?.name ?? t('formerMember'),
    },
  ]

  return (
    <DataTable
      columns={columns}
      data={agents}
      getRowId={(agent) => agent.id}
      labels={{ caption: t('tableLabel'), actions: t('columns.actions') }}
      sort={{ id: SORT_COLUMN[sort], desc: sort !== 'name' }}
      onSortChange={(next) => {
        const chosen = COLUMN_SORT[next.id]
        if (chosen) onSortChange(chosen)
      }}
      getRowHref={getHref}
      linkComponent={Link}
      rowActions={(agent) => (
        <AgentRowMenu agent={agent} canCreate={canCreate} onAction={onAction} />
      )}
      isLoading={isLoading}
      emptyState={emptyState}
    />
  )
}
