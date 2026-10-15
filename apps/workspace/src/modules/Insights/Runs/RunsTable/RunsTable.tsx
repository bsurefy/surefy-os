// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'

import type { AgentRunDto } from '@surefy/contracts'
import { DataTable, StatusPill } from '@surefy/ui/components/DataDisplay'
import type { DataTableColumn, DataTableSort } from '@surefy/ui/components/DataDisplay'
import { ConfidenceChip } from '@surefy/ui/components/Feedback'
import type { ConfidenceThresholds } from '@surefy/ui/components/Feedback'

import { microsToUnits, splitDuration } from '../../InsightsOverview/InsightsOverview.utils'
import { STATUS_TONE } from '../Runs.constants'
import { shortRunId } from '../Runs.utils'

import type { Route } from 'next'
import type { ReactNode } from 'react'

interface RunsTableProps {
  rows: AgentRunDto[]
  isLoading: boolean
  emptyState: ReactNode
  sort: DataTableSort
  onSortChange: (sort: DataTableSort) => void
  thresholds: ConfidenceThresholds
  getRunHref: (runId: string) => Route
}

/**
 * The run log: which run, which agent, how and by whom it started, the model, how it went, the
 * lowest confidence, how long it took, what it cost and when it started.
 */
export default function RunsTable({
  rows,
  isLoading,
  emptyState,
  sort,
  onSortChange,
  thresholds,
  getRunHref,
}: Readonly<RunsTableProps>) {
  const t = useTranslations('insights.runs')
  const format = useFormatter()

  const columns: DataTableColumn<AgentRunDto>[] = [
    {
      id: 'run',
      header: t('columns.run'),
      isHideable: false,
      width: '7rem',
      cell: (run) => <span className="text-body font-mono">{shortRunId(run.id)}</span>,
    },
    {
      id: 'agent',
      header: t('columns.agent'),
      isHideable: false,
      cell: (run) => (
        <div className="flex min-w-0 flex-col">
          <span className="text-body truncate">
            {run.agent && !run.isAgentDeleted ? run.agent.name : t('deletedAgent')}
          </span>
          <span className="text-caption text-muted-foreground">
            {run.agentVersion === null ? t('draft') : t('version', { version: run.agentVersion })}
          </span>
        </div>
      ),
    },
    {
      id: 'trigger',
      header: t('columns.trigger'),
      width: '7rem',
      cell: (run) => t(`triggers.${run.trigger}`),
    },
    {
      id: 'startedBy',
      header: t('columns.startedBy'),
      cell: (run) => (
        <span className="text-body truncate">{run.startedBy?.name ?? t('noPerson')}</span>
      ),
    },
    {
      id: 'model',
      header: t('columns.model'),
      cell: (run) => <span className="text-body truncate">{run.model?.displayName ?? '—'}</span>,
    },
    {
      id: 'status',
      header: t('columns.status'),
      isHideable: false,
      width: '11rem',
      cell: (run) => (
        <div className="flex flex-col items-start gap-1">
          <StatusPill
            label={t(`statuses.${run.status}`)}
            tone={STATUS_TONE[run.status]}
            isPulsing={run.status === 'running'}
          />
          {run.neededHuman && (
            <span className="text-caption text-muted-foreground">{t('neededHuman')}</span>
          )}
        </div>
      ),
    },
    {
      id: 'confidence',
      header: t('columns.confidence'),
      width: '9rem',
      cell: (run) =>
        run.minConfidence === null ? (
          '—'
        ) : (
          <ConfidenceChip
            value={run.minConfidence}
            thresholds={thresholds}
            bandLabels={{ high: t('bands.high'), medium: t('bands.medium'), low: t('bands.low') }}
          />
        ),
    },
    {
      id: 'durationMs',
      header: t('columns.duration'),
      align: 'end',
      width: '7rem',
      isSortable: true,
      cell: (run) => {
        if (run.durationMs === null) return '—'
        const duration = splitDuration(run.durationMs)
        return t(`duration.${duration.unit}`, {
          value: format.number(duration.value, { maximumFractionDigits: 1 }),
        })
      },
    },
    {
      id: 'costMicros',
      header: t('columns.cost'),
      align: 'end',
      width: '7rem',
      isSortable: true,
      cell: (run) =>
        run.model?.source === 'local'
          ? t('local')
          : format.number(microsToUnits(run.costMicros), {
              style: 'currency',
              currency: run.currency,
              maximumFractionDigits: 4,
            }),
    },
    {
      id: 'startedAt',
      header: t('columns.started'),
      width: '10rem',
      isSortable: true,
      cell: (run) => {
        const at = new Date(run.startedAt ?? run.createdAt)
        return (
          <time dateTime={at.toISOString()} className="flex flex-col tabular-nums">
            <span className="text-body">{format.dateTime(at, { timeStyle: 'short' })}</span>
            <span className="text-caption text-muted-foreground">
              {format.dateTime(at, { dateStyle: 'medium' })}
            </span>
          </time>
        )
      },
    },
  ]

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(run) => run.id}
      labels={{ caption: t('tableLabel') }}
      sort={sort}
      onSortChange={onSortChange}
      getRowHref={(run) => getRunHref(run.id)}
      linkComponent={Link}
      isLoading={isLoading}
      emptyState={emptyState}
    />
  )
}
