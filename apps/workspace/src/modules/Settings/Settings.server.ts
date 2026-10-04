// SPDX-License-Identifier: AGPL-3.0-only
import { notFound } from 'next/navigation'

import { ROUTES } from '@/constants/routes'
import { getCurrentOrg, getEffectiveAccess } from '@/core/auth'
import { requireSession } from '@surefy/web-core/auth/server'

import { SETTINGS_SECTIONS } from './Settings.constants'
import { getVisibleSettingsSections, isSettingsSectionVisible } from './Settings.utils'

import type { SettingsSection } from '@/constants/routes'

async function loadSettingsContext(orgSlug: string) {
  const session = await requireSession(ROUTES.auth.login)
  const org = await getCurrentOrg(orgSlug)
  const access = await getEffectiveAccess(org.id)
  const context = { access, install: session.install, isInstallAdmin: session.isInstallAdmin }
  return { org, access, context }
}

/**
 * For a settings section page, called first: an unreleased section answers the not-found page;
 * otherwise the caller renders `NoAccessState` when `isAllowed` is false.
 */
export async function checkSettingsSection(orgSlug: string, section: SettingsSection) {
  const entry = SETTINGS_SECTIONS.find((item) => item.section === section)
  if (!entry?.released) notFound()
  const { org, access, context } = await loadSettingsContext(orgSlug)
  return { org, access, isAllowed: isSettingsSectionVisible(entry, context) }
}

/** Where `/[orgSlug]/settings` leads: the first section the person sees, if any. */
export async function getFirstSettingsSection(
  orgSlug: string,
): Promise<SettingsSection | undefined> {
  const { context } = await loadSettingsContext(orgSlug)
  return getVisibleSettingsSections(SETTINGS_SECTIONS, context)[0]?.section
}
