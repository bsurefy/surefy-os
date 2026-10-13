// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'

import type { AgentRunDto } from '@surefy/contracts'
import { DataTable, StatusPill } from '@surefy/ui/components/DataDisplay'
import type { DataTableColumn } from '@surefy/ui/components/DataDisplay'

import { microsToUnits, splitDuration } from '../../AgentEditor.utils'
import { STATUS_TONE } from '../RunsTab.constants'
import { shortRunId } from '../RunsTab.utils'

import type { Route } from 'next'
import type { ReactNode } from 'react'

interface RunsTableProps {
  rows: AgentRunDto[]
  isLoading: boolean
  emptyState: ReactNode
  getRunHref: (runId: string) => Route
}

/** The agent's runs: when, which run, who or what started it, how it went, and what it cost. */
export default function RunsTable({
  rows,
  isLoading,
  emptyState,
  getRunHref,
}: Readonly<RunsTableProps>) {
  const t = useTranslations('agents.editor.runs')
  const format = useFormatter()

  const columns: DataTableColumn<AgentRunDto>[] = [
    {
      id: 'startedAt',
      header: t('columns.when'),
      isHideable: false,
      width: '12rem',
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
    {
      id: 'run',
      header: t('columns.run'),
      isHideable: false,
      cell: (run) => (
        <div className="flex min-w-0 flex-col">
          <span className="text-body font-mono">{shortRunId(run.id)}</span>
          {run.isTest && <span className="text-caption text-muted-foreground">{t('test')}</span>}
        </div>
      ),
    },
    {
      id: 'startedBy',
      header: t('columns.startedBy'),
      cell: (run) => (
        <div className="flex min-w-0 flex-col">
          <span className="text-body truncate">
            {run.startedBy?.name ?? t(`triggers.${run.trigger}`)}
          </span>
          {run.startedBy && (
            <span className="text-caption text-muted-foreground">
              {t(`triggers.${run.trigger}`)}
            </span>
          )}
        </div>
      ),
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
      id: 'version',
      header: t('columns.version'),
      width: '6rem',
      cell: (run) =>
        run.agentVersion === null ? t('draft') : t('version', { version: run.agentVersion }),
    },
    {
      id: 'duration',
      header: t('columns.duration'),
      align: 'end',
      width: '7rem',
      cell: (run) => {
        const duration = run.durationMs === null ? null : splitDuration(run.durationMs)
        return (
          <span>
            {duration
              ? t(`duration.${duration.unit}`, {
                  value: format.number(duration.value, { maximumFractionDigits: 1 }),
                })
              : '—'}
          </span>
        )
      },
    },
    {
      id: 'cost',
      header: t('columns.cost'),
      align: 'end',
      width: '7rem',
      cell: (run) =>
        format.number(microsToUnits(run.costMicros), {
          style: 'currency',
          currency: run.currency,
          maximumFractionDigits: 4,
        }),
    },
  ]

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(run) => run.id}
      labels={{ caption: t('tableLabel') }}
      getRowHref={(run) => getRunHref(run.id)}
      linkComponent={Link}
      isLoading={isLoading}
      emptyState={emptyState}
    />
  )
}
