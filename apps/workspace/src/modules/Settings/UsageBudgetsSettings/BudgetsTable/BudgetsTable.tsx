// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Ellipsis } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'

import type { BudgetDto } from '@surefy/contracts'
import { DataTable, StatusPill } from '@surefy/ui/components/DataDisplay'
import type { DataTableColumn } from '@surefy/ui/components/DataDisplay'
import { Button } from '@surefy/ui/primitives/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@surefy/ui/primitives/dropdown-menu'

import BudgetMeter from '../BudgetMeter'
import { bpToPercent } from '../UsageBudgetsSettings.utils'

import type { BudgetsTableProps } from './BudgetsTable.types'

/** Team budgets or personal limits: who, this month's spend, what happens when reached, alerts. */
export default function BudgetsTable({
  scope,
  rows,
  isLoading,
  emptyState,
  canManage,
  onEdit,
  onDelete,
}: Readonly<BudgetsTableProps>) {
  const t = useTranslations('settings.usage')
  const format = useFormatter()
  const nameOf = (row: BudgetDto) => row.team?.name ?? row.user?.name ?? t('formerTarget')

  const target: DataTableColumn<BudgetDto> =
    scope === 'team'
      ? {
          id: 'team',
          header: t('columns.team'),
          isHideable: false,
          cell: (row) => <span className="text-body font-medium">{nameOf(row)}</span>,
        }
      : {
          id: 'person',
          header: t('columns.person'),
          isHideable: false,
          cell: (row) => (
            <div className="flex min-w-0 flex-col">
              <span className="text-body truncate font-medium">{nameOf(row)}</span>
              {row.user && (
                <span className="text-caption text-muted-foreground truncate">
                  {row.user.email}
                </span>
              )}
            </div>
          ),
        }

  const columns: DataTableColumn<BudgetDto>[] = [
    target,
    ...(scope === 'user'
      ? [
          {
            id: 'chargedTo',
            header: t('columns.chargedTo'),
            cell: (row: BudgetDto) => row.primaryTeam?.name ?? t('noPrimaryTeam'),
          },
        ]
      : []),
    {
      id: 'thisMonth',
      header: t('columns.thisMonth'),
      cell: (row) => <BudgetMeter budget={row} />,
    },
    {
      id: 'onReached',
      header: t('columns.onReached'),
      cell: (row) => t(`onReached.${row.onReached}.label`),
    },
    {
      id: 'alerts',
      header: t('columns.alerts'),
      cell: (row) => (
        <div className="flex flex-col">
          <span className="text-body tabular-nums">
            {row.alertThresholdsBp.length > 0
              ? row.alertThresholdsBp.map((bp) => `${String(bpToPercent(bp))}%`).join(', ')
              : t('noAlerts')}
          </span>
          {row.lastAlert && (
            <span className="text-caption text-muted-foreground">
              {t('lastAlert', {
                percent: bpToPercent(row.lastAlert.thresholdBp),
                date: format.dateTime(new Date(row.lastAlert.triggeredAt), {
                  month: 'short',
                  day: 'numeric',
                }),
              })}
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'status',
      header: t('columns.status'),
      cell: (row) => (
        <StatusPill
          label={row.isEnabled ? t('status.on') : t('status.off')}
          tone={row.isEnabled ? 'success' : 'neutral'}
        />
      ),
    },
  ]

  const rowActions = (row: BudgetDto) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t('rowActions', { name: nameOf(row) })}>
          <Ellipsis aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() => {
            onEdit(row)
          }}
        >
          {t('actions.edit')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive"
          onSelect={() => {
            onDelete(row)
          }}
        >
          {t('actions.delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      labels={{ caption: t(`tables.${scope}`), actions: t('columns.actions') }}
      rowActions={canManage ? rowActions : undefined}
      isLoading={isLoading}
      emptyState={emptyState}
    />
  )
}
