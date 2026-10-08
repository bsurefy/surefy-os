// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Lock } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { GuardRuleRowDto } from '@surefy/contracts'
import { DataTable } from '@surefy/ui/components/DataDisplay'
import type { DataTableColumn } from '@surefy/ui/components/DataDisplay'
import { Button } from '@surefy/ui/primitives/button'
import { Switch } from '@surefy/ui/primitives/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@surefy/ui/primitives/tooltip'

import type { GuardrailsTableProps } from './GuardrailsTable.types'

/**
 * The guardrails table: name (opens the sheet), type, scope, used by, triggered this week, on/off
 * and the lock. Agent and flow rules are listed too, read-only here.
 */
export default function GuardrailsTable({
  rows,
  isLoading,
  sort,
  onSortChange,
  emptyState,
  canToggle,
  onOpen,
  onToggle,
}: Readonly<GuardrailsTableProps>) {
  const t = useTranslations('guard.guardrails')

  const columns: DataTableColumn<GuardRuleRowDto>[] = [
    {
      id: 'name',
      header: t('columns.name'),
      isSortable: true,
      isHideable: false,
      cell: (row) => (
        <span className="flex min-w-0 items-center gap-2">
          <Button
            variant="link"
            className="h-auto min-w-0 justify-start p-0 font-medium"
            onClick={() => {
              onOpen(row)
            }}
          >
            <span className="truncate">{row.name}</span>
          </Button>
          {row.isLocked && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="text-muted-foreground inline-flex shrink-0"
                  role="img"
                  aria-label={t('locked.label')}
                >
                  <Lock aria-hidden className="size-3.5" />
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {t('locked.detail', {
                  name: row.lockedBy?.name ?? t('locked.owner'),
                  reason: row.lockedReason ?? '',
                })}
              </TooltipContent>
            </Tooltip>
          )}
        </span>
      ),
    },
    { id: 'type', header: t('columns.type'), cell: (row) => t(`types.${row.type}`) },
    {
      id: 'scope',
      header: t('columns.scope'),
      cell: (row) =>
        row.scope === 'team' && row.team
          ? t('scopeTeam', { team: row.team.name })
          : t(`scopes.${row.scope}`),
    },
    {
      id: 'usedBy',
      header: t('columns.usedBy'),
      cell: (row) => t('usedBy', { count: row.usedByCount }),
    },
    {
      id: 'triggeredThisWeek',
      header: t('columns.triggered'),
      isSortable: true,
      align: 'end',
      cell: (row) => row.triggeredThisWeek,
    },
    {
      id: 'isEnabled',
      header: t('columns.status'),
      cell: (row) => (
        <Switch
          size="sm"
          checked={row.isEnabled}
          disabled={!canToggle(row)}
          aria-label={t('toggle', { name: row.name })}
          onCheckedChange={(checked) => {
            onToggle(row, checked)
          }}
        />
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(row) => `${row.type}:${row.id}:${row.ruleKey ?? ''}`}
      labels={{ caption: t('tableLabel'), actions: t('columns.actions') }}
      sort={sort}
      onSortChange={onSortChange}
      isLoading={isLoading}
      emptyState={emptyState}
    />
  )
}
