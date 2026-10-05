// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { Filter } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'

import type { InsightsBreakdownDimension, InsightsBreakdownDto } from '@surefy/contracts'
import { BarChart, ChartFrame, EmptyState } from '@surefy/ui/components/DataDisplay'
import { ErrorState } from '@surefy/ui/components/Feedback'
import { SegmentedControl } from '@surefy/ui/components/Forms'
import { Button } from '@surefy/ui/primitives/button'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@surefy/ui/primitives/table'

import { BREAKDOWN_DIMENSIONS, CHART_HEIGHT } from '../InsightsOverview.constants'
import { costMicrosOf, microsToUnits, toCostData, toCostGroups } from '../InsightsOverview.utils'

import type { CostGroup } from '../InsightsOverview.types'

interface CostBreakdownProps {
  by: InsightsBreakdownDimension
  data: InsightsBreakdownDto | undefined
  isLoading: boolean
  error: { message: string; reference?: string } | null
  onRetry: () => void
  onByChange: (by: InsightsBreakdownDimension) => void
  /** Narrows the page to one group (drill-down). */
  onFilterGroup: (by: InsightsBreakdownDimension, key: string) => void
}

/** Cost by team, person or model: the top groups and "Others", as a bar chart or a table. */
export default function CostBreakdown({
  by,
  data,
  isLoading,
  error,
  onRetry,
  onByChange,
  onFilterGroup,
}: Readonly<CostBreakdownProps>) {
  const t = useTranslations('insights.overview.cost')
  const tChart = useTranslations('insights.overview.chart')
  const format = useFormatter()
  const currency = data?.total.cost[0]?.currency ?? 'USD'
  const money = (units: number) => format.number(units, { style: 'currency', currency })

  const labelOf = (row: InsightsBreakdownDto['rows'][number]): string => {
    if (row.label) return row.label
    if (row.key === null) return by === 'person' ? t('noPerson') : t('noTeam')
    if (by === 'team') return t('deletedTeam')
    if (by === 'person') return t('formerMember')
    return row.key
  }
  const groups: CostGroup[] = data
    ? toCostGroups(data, labelOf, (count) => t('others', { count }))
    : []

  let state: 'ready' | 'loading' | 'empty' | 'error' = 'ready'
  if (isLoading) state = 'loading'
  else if (error) state = 'error'
  else if (groups.length === 0) state = 'empty'

  const costCell = (group: CostGroup) =>
    group.isLocal ? t('local') : money(microsToUnits(group.costMicros))

  const table = (
    <Table>
      <TableCaption className="sr-only">{t('label', { by })}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{t(`dimensions.${by}`)}</TableHead>
          <TableHead scope="col" className="text-right">
            {t('series')}
          </TableHead>
          <TableHead scope="col" className="text-right">
            {t('tokens')}
          </TableHead>
          <TableHead scope="col" className="text-right">
            {t('requests')}
          </TableHead>
          <TableHead scope="col">
            <span className="sr-only">{t('actions')}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map((group) => (
          <TableRow key={group.isOthers ? 'others' : (group.key ?? 'none')}>
            <TableCell>{group.label}</TableCell>
            <TableCell className="text-right tabular-nums">{costCell(group)}</TableCell>
            <TableCell className="text-right tabular-nums">{format.number(group.tokens)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {format.number(group.requests)}
            </TableCell>
            <TableCell className="w-10">
              {!group.isOthers && group.key !== null && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  icon={Filter}
                  aria-label={t('filterBy', { label: group.label })}
                  onClick={() => {
                    if (group.key !== null) onFilterGroup(by, group.key)
                  }}
                />
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )

  return (
    <ChartFrame
      title={t('title', { by })}
      description={
        data
          ? t('description', { total: money(microsToUnits(costMicrosOf(data.total.cost))) })
          : undefined
      }
      labels={{ chart: tChart('chart'), table: tChart('table'), view: tChart('view') }}
      state={state}
      height={CHART_HEIGHT}
      stateContent={
        state === 'error' ? (
          <ErrorState
            title={tChart('error')}
            message={error?.message ?? ''}
            reference={error?.reference}
            onRetry={onRetry}
          />
        ) : (
          <EmptyState size="sm" title={t('empty')} headingLevel={3} />
        )
      }
      actions={
        <SegmentedControl
          label={t('groupBy')}
          size="sm"
          value={by}
          onValueChange={onByChange}
          options={BREAKDOWN_DIMENSIONS.map((value) => ({
            value,
            label: t(`dimensions.${value}`),
          }))}
        />
      }
      table={table}
    >
      <BarChart
        data={toCostData(groups)}
        xKey="group"
        series={[{ key: 'cost', label: t('series') }]}
        height={CHART_HEIGHT}
        formatValue={(value) =>
          format.number(value, { style: 'currency', currency, notation: 'compact' })
        }
        label={t('label', { by })}
      />
    </ChartFrame>
  )
}
