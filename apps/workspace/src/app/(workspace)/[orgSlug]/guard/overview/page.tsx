// SPDX-License-Identifier: AGPL-3.0-only
import { getTranslations } from 'next-intl/server'

import { checkPageAccess } from '@/core/auth'
import { GuardOverview } from '@/modules/Guard'
import { assertNavReleased, NoAccessState } from '@/modules/Workspace'
import { PERMISSIONS } from '@surefy/contracts'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('guard.overview')
  return { title: t('title') }
}

/** Guard › Overview. */
export default async function GuardOverviewPage({
  params,
}: Readonly<PageProps<'/[orgSlug]/guard/overview'>>) {
  assertNavReleased('guard')
  const { orgSlug } = await params
  const { isAllowed } = await checkPageAccess(orgSlug, PERMISSIONS.GUARD_READ)
  if (!isAllowed) return <NoAccessState area="guard" />
  return <GuardOverview />
}
