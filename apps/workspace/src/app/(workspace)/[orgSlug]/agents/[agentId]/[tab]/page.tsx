// SPDX-License-Identifier: AGPL-3.0-only
import { getTranslations } from 'next-intl/server'

import { checkPageAccess } from '@/core/auth'
import { AgentEditor } from '@/modules/Agents'
import { assertNavReleased, NoAccessState } from '@/modules/Workspace'
import { PERMISSIONS } from '@surefy/contracts'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('agents.editor')
  return { title: t('title') }
}

export default async function AgentTabPage({
  params,
}: Readonly<PageProps<'/[orgSlug]/agents/[agentId]/[tab]'>>) {
  assertNavReleased('agents')
  const { orgSlug } = await params
  const { isAllowed } = await checkPageAccess(orgSlug, PERMISSIONS.AGENTS_READ)
  if (!isAllowed) return <NoAccessState area="agents" />
  return <AgentEditor />
}
