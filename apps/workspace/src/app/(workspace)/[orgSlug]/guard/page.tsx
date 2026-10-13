// SPDX-License-Identifier: AGPL-3.0-only
import { redirect } from 'next/navigation'

import { ROUTES } from '@/constants/routes'
import { checkPageAccess } from '@/core/auth'
import { assertNavReleased, toRoute } from '@/modules/Workspace'
import { PERMISSIONS } from '@surefy/contracts'

/** `/[orgSlug]/guard` opens Overview, or the audit log for a person who may read only that. */
export default async function GuardPage({ params }: Readonly<PageProps<'/[orgSlug]/guard'>>) {
  assertNavReleased('guard')
  const { orgSlug } = await params
  const { isAllowed } = await checkPageAccess(orgSlug, PERMISSIONS.GUARD_READ)
  redirect(toRoute(ROUTES.workspace.guard(orgSlug, isAllowed ? 'overview' : 'audit-log')))
}
