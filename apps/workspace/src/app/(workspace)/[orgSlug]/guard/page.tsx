// SPDX-License-Identifier: AGPL-3.0-only
import { redirect } from 'next/navigation'

import { ROUTES } from '@/constants/routes'
import { assertNavReleased, toRoute } from '@/modules/Workspace'

/** `/[orgSlug]/guard` opens the audit log, the one tab released so far. */
export default async function GuardPage({ params }: Readonly<PageProps<'/[orgSlug]/guard'>>) {
  assertNavReleased('guard')
  const { orgSlug } = await params
  redirect(toRoute(ROUTES.workspace.guard(orgSlug, 'audit-log')))
}
