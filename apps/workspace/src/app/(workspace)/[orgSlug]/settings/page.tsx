// SPDX-License-Identifier: AGPL-3.0-only
import { redirect } from 'next/navigation'

import { ROUTES } from '@/constants/routes'
import { getFirstSettingsSection } from '@/modules/Settings'
import { assertNavReleased, NoAccessState, toRoute } from '@/modules/Workspace'

/** Settings opens on the first section the person can see. */
export default async function SettingsPage({ params }: Readonly<PageProps<'/[orgSlug]/settings'>>) {
  assertNavReleased('settings')
  const { orgSlug } = await params
  const section = await getFirstSettingsSection(orgSlug)
  if (!section) return <NoAccessState area="settings" />
  redirect(toRoute(ROUTES.workspace.settings(orgSlug, section)))
}
