// SPDX-License-Identifier: AGPL-3.0-only
import { getTranslations } from 'next-intl/server'

import { checkPageAccess } from '@/core/auth'
import { ApprovalDetail } from '@/modules/Insights'
import { NoAccessState } from '@/modules/Workspace'
import { PERMISSIONS } from '@surefy/contracts'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('insights.approvals')
  return { title: t('title') }
}

/** One approval: what will happen and the decision. Notifications and the popover link here. */
export default async function ApprovalPage({
  params,
}: Readonly<PageProps<'/[orgSlug]/insights/approvals/[approvalId]'>>) {
  const { orgSlug } = await params
  const { isAllowed } = await checkPageAccess(orgSlug, PERMISSIONS.APPROVALS_READ)
  if (!isAllowed) return <NoAccessState area="guard" />
  return <ApprovalDetail />
}
