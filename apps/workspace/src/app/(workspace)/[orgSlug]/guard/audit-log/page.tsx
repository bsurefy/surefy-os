// SPDX-License-Identifier: AGPL-3.0-only
import { getTranslations } from 'next-intl/server'

import { checkPageAccess } from '@/core/auth'
import { AuditLog } from '@/modules/Guard'
import { assertNavReleased, NoAccessState } from '@/modules/Workspace'
import { PERMISSIONS } from '@surefy/contracts'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('guard.auditLog')
  return { title: t('title') }
}

export default async function AuditLogPage({
  params,
}: Readonly<PageProps<'/[orgSlug]/guard/audit-log'>>) {
  assertNavReleased('guard')
  const { orgSlug } = await params
  const { isAllowed } = await checkPageAccess(orgSlug, PERMISSIONS.AUDIT_READ)
  if (!isAllowed) return <NoAccessState area="guard" />
  return <AuditLog />
}
