// SPDX-License-Identifier: AGPL-3.0-only
import { getTranslations } from 'next-intl/server'

import { SETTINGS_SECTION } from '@/constants/routes'
import { UsageBudgetsSettings, checkSettingsSection } from '@/modules/Settings'
import { assertNavReleased, NoAccessState } from '@/modules/Workspace'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings.usage')
  return { title: t('title') }
}

export default async function UsagePage({
  params,
}: Readonly<PageProps<'/[orgSlug]/settings/usage'>>) {
  assertNavReleased('settings')
  const { orgSlug } = await params
  const { isAllowed } = await checkSettingsSection(orgSlug, SETTINGS_SECTION.USAGE)
  if (!isAllowed) return <NoAccessState area="settings" />
  return <UsageBudgetsSettings />
}
