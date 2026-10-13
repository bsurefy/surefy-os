// SPDX-License-Identifier: AGPL-3.0-only
import { getTranslations } from 'next-intl/server'

import { checkPageAccess } from '@/core/auth'
import { RunDetail } from '@/modules/Insights'
import { NoAccessState } from '@/modules/Workspace'
import { PERMISSIONS } from '@surefy/contracts'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('insights.runs')
  return { title: t('title') }
}

/** One run. The agent editor's Runs tab, approvals and notifications link here. */
export default async function RunPage({
  params,
}: Readonly<PageProps<'/[orgSlug]/insights/runs/[runId]'>>) {
  const { orgSlug } = await params
  const { isAllowed } = await checkPageAccess(orgSlug, PERMISSIONS.RUNS_READ)
  if (!isAllowed) return <NoAccessState area="insights" />
  return <RunDetail />
}
