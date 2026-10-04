// SPDX-License-Identifier: AGPL-3.0-only
import { getTranslations } from 'next-intl/server'

import { checkPageAccess } from '@/core/auth'
import { KnowledgeLibrary } from '@/modules/Knowledge'
import { assertNavReleased, NoAccessState } from '@/modules/Workspace'
import { PERMISSIONS } from '@surefy/contracts'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('knowledge.library')
  return { title: t('title') }
}

export default async function KnowledgePage({
  params,
}: Readonly<PageProps<'/[orgSlug]/knowledge'>>) {
  assertNavReleased('knowledge')
  const { orgSlug } = await params
  const { isAllowed } = await checkPageAccess(orgSlug, PERMISSIONS.KNOWLEDGE_UPLOAD)
  if (!isAllowed) return <NoAccessState area="knowledge" />
  return <KnowledgeLibrary />
}
