// SPDX-License-Identifier: AGPL-3.0-only
import { getTranslations } from 'next-intl/server'

import { getCurrentOrg } from '@/core/auth'
import { ProfileSettings } from '@/modules/Workspace'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('workspace.profile')
  return { title: t('title') }
}

/** Every member has a profile; no permission check beyond membership. */
export default async function ProfilePage({ params }: Readonly<PageProps<'/[orgSlug]/profile'>>) {
  const { orgSlug } = await params
  await getCurrentOrg(orgSlug)
  return <ProfileSettings orgSlug={orgSlug} />
}
