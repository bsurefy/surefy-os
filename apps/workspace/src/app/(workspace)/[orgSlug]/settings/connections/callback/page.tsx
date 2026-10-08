// SPDX-License-Identifier: AGPL-3.0-only
import { getTranslations } from 'next-intl/server'

import { SETTINGS_SECTION } from '@/constants/routes'
import { ConnectionsOAuthCallback, checkSettingsSection } from '@/modules/Settings'
import { assertNavReleased, NoAccessState } from '@/modules/Workspace'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings.connections.callback')
  return { title: t('title') }
}

/** Where an app's sign-in returns to; it completes the connection and goes back to the list. */
export default async function ConnectionsCallbackPage({
  params,
}: Readonly<PageProps<'/[orgSlug]/settings/connections/callback'>>) {
  assertNavReleased('settings')
  const { orgSlug } = await params
  const { isAllowed } = await checkSettingsSection(orgSlug, SETTINGS_SECTION.CONNECTIONS)
  if (!isAllowed) return <NoAccessState area="settings" />
  return <ConnectionsOAuthCallback />
}
