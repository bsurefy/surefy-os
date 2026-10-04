// SPDX-License-Identifier: AGPL-3.0-only
import { getTranslations } from 'next-intl/server'

import { SETTINGS_SECTION } from '@/constants/routes'
import { checkSettingsSection, TeamsSettings } from '@/modules/Settings'
import { assertNavReleased, NoAccessState } from '@/modules/Workspace'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings.sections')
  return { title: t('teams') }
}

export default async function TeamsSettingsPage({
  params,
}: Readonly<PageProps<'/[orgSlug]/settings/teams'>>) {
  assertNavReleased('settings')
  const { orgSlug } = await params
  const { isAllowed } = await checkSettingsSection(orgSlug, SETTINGS_SECTION.TEAMS)
  if (!isAllowed) return <NoAccessState area="settings" />
  return <TeamsSettings />
}
