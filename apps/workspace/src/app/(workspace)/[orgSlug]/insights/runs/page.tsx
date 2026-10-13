// SPDX-License-Identifier: AGPL-3.0-only
import { getTranslations } from 'next-intl/server'

import { checkPageAccess } from '@/core/auth'
import { Runs } from '@/modules/Insights'
import { NoAccessState } from '@/modules/Workspace'
import { PERMISSIONS } from '@surefy/contracts'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('insights.runs')
  return { title: t('title') }
}

/** Insights › Runs: Builders see the runs of their agents, Admins and Owners every run. */
export default async function RunsPage({
  params,
}: Readonly<PageProps<'/[orgSlug]/insights/runs'>>) {
  const { orgSlug } = await params
  const { isAllowed } = await checkPageAccess(orgSlug, PERMISSIONS.RUNS_READ)
  if (!isAllowed) return <NoAccessState area="insights" />
  return <Runs />
}
