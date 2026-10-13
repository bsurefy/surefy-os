// SPDX-License-Identifier: AGPL-3.0-only
import { checkPageAccess } from '@/core/auth'
import { AgentEditor } from '@/modules/Agents'
import { assertNavReleased, NoAccessState } from '@/modules/Workspace'
import { PERMISSIONS } from '@surefy/contracts'

/**
 * One agent in the editor, on whichever tab. The editor is the layout, so the working copy and its
 * autosave stay in place while the person moves between tabs; the tab pages render nothing.
 */
export default async function AgentEditorLayout({
  params,
}: Readonly<LayoutProps<'/[orgSlug]/agents/[agentId]'>>) {
  assertNavReleased('agents')
  const { orgSlug } = await params
  const { isAllowed } = await checkPageAccess(orgSlug, PERMISSIONS.AGENTS_READ)
  if (!isAllowed) return <NoAccessState area="agents" />
  return <AgentEditor />
}
