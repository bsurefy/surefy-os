// SPDX-License-Identifier: AGPL-3.0-only
import { getTranslations } from 'next-intl/server'

import { checkPageAccess } from '@/core/auth'
import { InsightsOverview } from '@/modules/Insights'
import { assertNavReleased, NoAccessState } from '@/modules/Workspace'
import { PERMISSIONS } from '@surefy/contracts'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('insights.overview')
  return { title: t('title') }
}

/** Insights › Overview, the default tab. */
export default async function InsightsPage({ params }: Readonly<PageProps<'/[orgSlug]/insights'>>) {
  assertNavReleased('insights')
  const { orgSlug } = await params
  const { isAllowed } = await checkPageAccess(orgSlug, PERMISSIONS.INSIGHTS_READ)
  if (!isAllowed) return <NoAccessState area="insights" />
  return <InsightsOverview />
}
