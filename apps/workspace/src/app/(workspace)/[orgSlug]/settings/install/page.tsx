// SPDX-License-Identifier: AGPL-3.0-only
import { getTranslations } from 'next-intl/server'

import { SETTINGS_SECTION } from '@/constants/routes'
import { checkSettingsSection, InstallSettings } from '@/modules/Settings'
import { assertNavReleased, NoAccessState } from '@/modules/Workspace'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings.sections')
  return { title: t('install') }
}

export default async function InstallSettingsPage({
  params,
}: Readonly<PageProps<'/[orgSlug]/settings/install'>>) {
  assertNavReleased('settings')
  const { orgSlug } = await params
  const { isAllowed } = await checkSettingsSection(orgSlug, SETTINGS_SECTION.INSTALL)
  if (!isAllowed) return <NoAccessState area="settings" />
  return <InstallSettings />
}
