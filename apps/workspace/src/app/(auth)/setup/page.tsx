// SPDX-License-Identifier: AGPL-3.0-only
import { getTranslations } from 'next-intl/server'

import { SetupWizard } from '@/modules/Setup'
import { getSession } from '@surefy/web-core/auth/server'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('setup.wizard')
  return { title: t('title') }
}

/**
 * First-run setup. An Owner who is already signed in (the browser was closed after the
 * organization was created) resumes where setup stopped.
 */
export default async function SetupPage() {
  const session = await getSession()
  const owner = session?.memberships.find((membership) => membership.role === 'owner')
  const resume = owner
    ? { id: owner.organization.id, name: owner.organization.name, slug: owner.organization.slug }
    : null
  return <SetupWizard resume={resume} />
}
