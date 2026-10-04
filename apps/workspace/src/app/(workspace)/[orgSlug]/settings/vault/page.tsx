// SPDX-License-Identifier: AGPL-3.0-only
import { getTranslations } from 'next-intl/server'

import { SETTINGS_SECTION } from '@/constants/routes'
import { checkSettingsSection } from '@/modules/Settings'
import { VaultSettings } from '@/modules/Vault'
import { assertNavReleased, NoAccessState } from '@/modules/Workspace'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('vault.page')
  return { title: t('title') }
}

/** Vault on its first tab. */
export default async function VaultPage({
  params,
}: Readonly<PageProps<'/[orgSlug]/settings/vault'>>) {
  assertNavReleased('settings')
  const { orgSlug } = await params
  const { isAllowed } = await checkSettingsSection(orgSlug, SETTINGS_SECTION.VAULT)
  if (!isAllowed) return <NoAccessState area="settings" />
  return <VaultSettings />
}
