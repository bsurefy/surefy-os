// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import Link from 'next/link'
import { useFormatter, useTimeZone, useTranslations } from 'next-intl'

import type { AuditEntryDto } from '@surefy/contracts'
import { DataTable, StatusPill } from '@surefy/ui/components/DataDisplay'
import type { DataTableColumn } from '@surefy/ui/components/DataDisplay'

import { AUDIT_TIME_FORMAT, OUTCOME_TONE } from '../AuditLog.constants'
import { useAuditLabels } from '../AuditLog.hooks'

import type { ReactNode } from 'react'

interface AuditTableProps {
  rows: AuditEntryDto[]
  isLoading: boolean
  emptyState: ReactNode
  getEntryHref: (entryId: string) => string
}

/** The audit log table: newest first, each row opens the entry's detail. */
export default function AuditTable({
  rows,
  isLoading,
  emptyState,
  getEntryHref,
}: Readonly<AuditTableProps>) {
  const t = useTranslations('guard.auditLog')
  const format = useFormatter()
  const timeZone = useTimeZone() ?? 'UTC'
  const labels = useAuditLabels()

  const columns: DataTableColumn<AuditEntryDto>[] = [
    {
      id: 'createdAt',
      header: t('columns.when', { timeZone }),
      isHideable: false,
      width: '12rem',
      cell: (entry) => (
        <time dateTime={entry.createdAt} className="tabular-nums">
          {format.dateTime(new Date(entry.createdAt), AUDIT_TIME_FORMAT)}
        </time>
      ),
    },
    {
      id: 'actor',
      header: t('columns.who'),
      isHideable: false,
      cell: (entry) => (
        <div className="flex min-w-0 flex-col">
          <span className="text-body truncate font-medium">{labels.actor(entry)}</span>
          {entry.actor.name && entry.actor.type !== 'user' && (
            <span className="text-caption text-muted-foreground truncate">
              {labels.actorType(entry)}
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'action',
      header: t('columns.what'),
      isHideable: false,
      cell: (entry) => labels.action(entry.action),
    },
    {
      id: 'object',
      header: t('columns.object'),
      cell: (entry) => <span className="truncate">{labels.object(entry)}</span>,
    },
    {
      id: 'model',
      header: t('columns.model'),
      cell: (entry) =>
        entry.modelKey ?? (
          <>
            <span aria-hidden className="text-muted-foreground">
              —
            </span>
            <span className="sr-only">{t('none')}</span>
          </>
        ),
    },
    {
      id: 'outcome',
      header: t('columns.result'),
      width: '8rem',
      cell: (entry) => (
        <StatusPill label={labels.outcome(entry)} tone={OUTCOME_TONE[entry.outcome]} />
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(entry) => entry.id}
      labels={{ caption: t('tableLabel') }}
      getRowHref={(entry) => getEntryHref(entry.id)}
      linkComponent={Link}
      isLoading={isLoading}
      emptyState={emptyState}
    />
  )
}
