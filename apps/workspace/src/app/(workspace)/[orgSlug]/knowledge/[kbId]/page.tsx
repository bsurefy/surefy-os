// SPDX-License-Identifier: AGPL-3.0-only
import { getTranslations } from 'next-intl/server'

import { checkPageAccess } from '@/core/auth'
import { KnowledgeBaseDetail } from '@/modules/Knowledge'
import { assertNavReleased, NoAccessState } from '@/modules/Workspace'
import { PERMISSIONS } from '@surefy/contracts'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('knowledge.detail')
  return { title: t('title') }
}

/** A knowledge base on its first tab. */
export default async function KnowledgeBasePage({
  params,
}: Readonly<PageProps<'/[orgSlug]/knowledge/[kbId]'>>) {
  assertNavReleased('knowledge')
  const { orgSlug } = await params
  const { isAllowed } = await checkPageAccess(orgSlug, PERMISSIONS.KNOWLEDGE_UPLOAD)
  if (!isAllowed) return <NoAccessState area="knowledge" />
  return <KnowledgeBaseDetail />
}
