// SPDX-License-Identifier: AGPL-3.0-only
import { getTranslations } from 'next-intl/server'

import { SETTINGS_SECTION } from '@/constants/routes'
import { ConnectionsSettings, checkSettingsSection } from '@/modules/Settings'
import { assertNavReleased, NoAccessState } from '@/modules/Workspace'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings.connections')
  return { title: t('title') }
}

export default async function ConnectionsPage({
  params,
}: Readonly<PageProps<'/[orgSlug]/settings/connections'>>) {
  assertNavReleased('settings')
  const { orgSlug } = await params
  const { isAllowed } = await checkSettingsSection(orgSlug, SETTINGS_SECTION.CONNECTIONS)
  if (!isAllowed) return <NoAccessState area="settings" />
  return <ConnectionsSettings />
}
