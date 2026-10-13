// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import Link from 'next/link'
import { useFormatter, useNow, useTranslations } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import { formatMicros } from '@/modules/Workspace'
import type { ApprovalDto } from '@surefy/contracts'
import { DataTable, StatusPill } from '@surefy/ui/components/DataDisplay'
import type { DataTableColumn, DataTableSelection } from '@surefy/ui/components/DataDisplay'

import { STATUS_TONE } from '../Approvals.constants'
import { useApprovalLabels } from '../Approvals.hooks'
import { isDecidable } from '../Approvals.utils'

import type { ReactNode } from 'react'

interface ApprovalsTableProps {
  rows: ApprovalDto[]
  orgSlug: string
  view: 'pending' | 'decided'
  isLoading: boolean
  emptyState: ReactNode
  selection: DataTableSelection
  onSelectionChange: (selection: DataTableSelection) => void
}

/**
 * The queue: oldest first, each row opens the approval. Items the person cannot decide stay
 * visible with the assignee. The checkbox column (bulk decisions) is on the waiting list only.
 */
export default function ApprovalsTable({
  rows,
  orgSlug,
  view,
  isLoading,
  emptyState,
  selection,
  onSelectionChange,
}: Readonly<ApprovalsTableProps>) {
  const t = useTranslations('insights.approvals')
  const format = useFormatter()
  const now = useNow()
  const labels = useApprovalLabels()

  const item: DataTableColumn<ApprovalDto> = {
    id: 'item',
    header: t('columns.item'),
    isHideable: false,
    cell: (row) => (
      <div className="flex min-w-0 flex-col">
        <span className="text-body truncate font-medium">{row.title}</span>
        <span className="text-caption text-muted-foreground truncate">
          {[labels.kind(row.kind), row.agent?.name ?? row.flow?.name ?? row.requestedBy?.name]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {row.status === 'pending' && !row.canDecide && (
          <span className="text-caption text-muted-foreground">
            {t('readOnly', { names: labels.assignees(row) })}
          </span>
        )}
      </div>
    ),
  }
  const amount: DataTableColumn<ApprovalDto> = {
    id: 'amount',
    header: t('columns.amount'),
    align: 'end',
    width: '8rem',
    cell: (row) =>
      row.amountMicros === null ? (
        <span className="text-muted-foreground">{t('noAmount')}</span>
      ) : (
        formatMicros(format, row.amountMicros, row.currency)
      ),
  }
  const confidence: DataTableColumn<ApprovalDto> = {
    id: 'confidence',
    header: t('columns.confidence'),
    align: 'end',
    width: '7rem',
    cell: (row) =>
      row.confidence === null ? (
        <span className="text-muted-foreground">{t('noAmount')}</span>
      ) : (
        format.number(row.confidence, { style: 'percent', maximumFractionDigits: 0 })
      ),
  }
  const rule: DataTableColumn<ApprovalDto> = {
    id: 'rule',
    header: t('columns.rule'),
    cell: (row) => row.ruleName ?? <span className="text-muted-foreground">{t('noRule')}</span>,
  }
  const age: DataTableColumn<ApprovalDto> = {
    id: 'age',
    header: t('columns.age'),
    width: '10rem',
    cell: (row) => (
      <span className="flex flex-col">
        <time dateTime={row.createdAt}>{format.relativeTime(new Date(row.createdAt), now)}</time>
        {row.isOverdue && isDecidable(row) && (
          <span className="text-caption text-warning">{t('overdue')}</span>
        )}
      </span>
    ),
  }
  const outcome: DataTableColumn<ApprovalDto> = {
    id: 'outcome',
    header: t('columns.outcome'),
    width: '10rem',
    cell: (row) => <StatusPill label={labels.status(row.status)} tone={STATUS_TONE[row.status]} />,
  }
  const decidedBy: DataTableColumn<ApprovalDto> = {
    id: 'decidedBy',
    header: t('columns.decidedBy'),
    cell: (row) =>
      row.decidedBy?.name ?? <span className="text-muted-foreground">{t('noAmount')}</span>,
  }
  const columns =
    view === 'pending'
      ? [item, amount, confidence, rule, age]
      : [item, amount, rule, outcome, decidedBy]

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      labels={{
        caption: t('table.caption'),
        selectAll: t('table.selectAll'),
        selectRow: () => t('table.selectRow'),
      }}
      getRowHref={(row) => ROUTES.workspace.approval(orgSlug, row.id)}
      linkComponent={Link}
      selection={view === 'pending' ? selection : undefined}
      onSelectionChange={view === 'pending' ? onSelectionChange : undefined}
      isLoading={isLoading}
      emptyState={emptyState}
    />
  )
}
