// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { LayoutDashboard, Shield } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useFormatter } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import type { GuardOverviewDto } from '@surefy/contracts'
import { EmptyState, IconTile, StatCard } from '@surefy/ui/components/DataDisplay'
import { ErrorState, SkeletonStat } from '@surefy/ui/components/Feedback'
import { SegmentedControl } from '@surefy/ui/components/Forms'
import { PageHeader, Section } from '@surefy/ui/components/Layout'
import { Button } from '@surefy/ui/primitives/button'

import GuardTabs from '../GuardTabs'
import AttentionList from './AttentionList'
import { BAND_STATS } from './GuardOverview.constants'
import { useGuardOverviewController } from './GuardOverview.controller'
import { getShare, splitMedian } from './GuardOverview.utils'

/**
 * Guard › Overview (design/workspace/guard.md): how actions were checked in the period (run
 * automatically, AI double-checked, needing a person), what limits blocked, personal data hidden,
 * calls on local models, the median time to approve, and "Needs your attention". It links to the
 * approvals queue and never lists approvals itself.
 */
export default function GuardOverview() {
  const c = useGuardOverviewController()
  const { t, data } = c
  const format = useFormatter()
  const { orgSlug } = useParams<{ orgSlug: string }>()

  const count = (value: number) => format.number(value)
  const medianLabel = (overview: GuardOverviewDto) => {
    if (overview.medianMinutesToApprove === null) return t('stats.medianMinutesToApprove.none')
    const { unit, count: amount } = splitMedian(overview.medianMinutesToApprove)
    return t(`duration.${unit}`, { count: amount })
  }

  let body
  if (c.errorMessage) {
    body = (
      <ErrorState
        title={t('loadError')}
        message={c.errorMessage}
        reference={c.errorReference}
        onRetry={c.refetch}
      />
    )
  } else if (c.isLoading || !data) {
    body = (
      <div aria-busy className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 7 }, (_, index) => (
          <SkeletonStat key={index} />
        ))}
      </div>
    )
  } else if (c.isEmpty) {
    body = (
      <EmptyState
        icon={LayoutDashboard}
        title={t('empty.title')}
        description={t('empty.description')}
      />
    )
  } else {
    body = (
      <>
        <Section title={t('checked.title')} description={t('checked.description')} isPlain>
          <div className="grid gap-4 sm:grid-cols-3">
            {BAND_STATS.map(({ key, field }) => (
              <StatCard
                key={key}
                label={t(`stats.${key}.label`)}
                value={count(data[field])}
                description={t(`stats.${key}.share`, {
                  share: format.number(getShare(data[field], c.checkedTotal), {
                    style: 'percent',
                    maximumFractionDigits: 0,
                  }),
                })}
              />
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={t('stats.blockedByLimits.label')}
              value={count(data.blockedByLimits)}
              description={t('stats.blockedByLimits.help')}
            />
            <StatCard
              label={t('stats.personalDataHidden.label')}
              value={count(data.personalDataHidden)}
              description={t('stats.personalDataHidden.help')}
            />
            <StatCard
              label={t('stats.ranOnLocalModels.label')}
              value={count(data.ranOnLocalModels)}
              description={t('stats.ranOnLocalModels.help')}
            />
            <StatCard
              label={t('stats.medianMinutesToApprove.label')}
              value={medianLabel(data)}
              description={t('stats.medianMinutesToApprove.help')}
            />
          </div>
        </Section>
        <AttentionList items={data.attention} />
        {c.canOpenQueue && (
          <Section
            title={t('approvals.title')}
            description={t('approvals.description')}
            actions={
              <Button variant="secondary" asChild>
                <Link href={toRoute(ROUTES.workspace.insights(orgSlug, 'approvals'))}>
                  {t('approvals.open')}
                </Link>
              </Button>
            }
          />
        )}
      </>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        icon={<IconTile icon={Shield} />}
        tabs={<GuardTabs active="overview" />}
        actions={
          <SegmentedControl
            label={t('range.label')}
            options={c.rangeOptions}
            value={c.range}
            onValueChange={c.onRangeChange}
          />
        }
      />
      {body}
    </div>
  )
}
