// SPDX-License-Identifier: AGPL-3.0-only
import { getTranslations } from 'next-intl/server'

import { checkPageAccess } from '@/core/auth'
import { Approvals } from '@/modules/Insights'
import { NoAccessState } from '@/modules/Workspace'
import { PERMISSIONS } from '@surefy/contracts'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('insights.approvals')
  return { title: t('title') }
}

/** Insights › Approvals: for anyone who can be asked to decide, not only people who see Insights. */
export default async function ApprovalsPage({
  params,
}: Readonly<PageProps<'/[orgSlug]/insights/approvals'>>) {
  const { orgSlug } = await params
  const { isAllowed } = await checkPageAccess(orgSlug, PERMISSIONS.APPROVALS_READ)
  if (!isAllowed) return <NoAccessState area="guard" />
  return <Approvals />
}
