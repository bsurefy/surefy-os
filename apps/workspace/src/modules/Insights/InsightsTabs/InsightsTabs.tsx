// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import { Tabs } from '@surefy/ui/components/Navigation'
import { hasPermission, useEffectiveAccess } from '@surefy/web-core/access'

import { INSIGHTS_TABS } from './InsightsTabs.constants'

import type { InsightsTabValue } from './InsightsTabs.constants'

/** The tabs of every Insights page: the ones the person may open and the module has released. */
export default function InsightsTabs({ active }: Readonly<{ active: InsightsTabValue }>) {
  const t = useTranslations('insights.tabs')
  const params = useParams<{ orgSlug: string }>()
  const { data: access } = useEffectiveAccess()

  const visible = INSIGHTS_TABS.filter(
    (tab) =>
      tab.released &&
      access &&
      tab.anyPermission.some((permission) => hasPermission(access, permission)),
  )
  // a single tab is no navigation
  if (visible.length < 2) return null

  const items = visible.map((tab) => ({
    value: tab.value,
    label: t(tab.value),
    href: toRoute(ROUTES.workspace.insights(params.orgSlug, tab.segment)),
  }))
  return <Tabs label={t('label')} items={items} value={active} linkComponent={Link} />
}
