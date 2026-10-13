// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { agentQueries } from '@/api/agents'
import { ROUTES } from '@/constants/routes'
import { diffAgentDefinitions } from '@surefy/contracts'
import { useCurrentOrgId } from '@surefy/web-core/access'

import { AGENT_EDITOR_TABS } from '../AgentEditor.constants'
import { useAgentAutosave } from '../AgentEditor.hooks'
import { toSaveableDefinition } from '../AgentEditor.utils'

import type { AgentEditorWorkspaceProps } from './AgentEditorWorkspace.types'

/**
 * The editor of one loaded agent: the working copy with its autosave, how far it is from the live
 * version, and the tabs. An archived agent, or one the person may not edit, is read-only.
 */
export function useAgentEditorWorkspaceController({ agent, activeTab }: AgentEditorWorkspaceProps) {
  const t = useTranslations('agents.editor')
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const orgId = useCurrentOrgId()
  const isArchived = agent.status === 'archived'
  const isReadOnly = isArchived || !agent.canEdit
  const draft = useAgentAutosave({ orgId, agent, isReadOnly })
  const live = useQuery({
    ...agentQueries.liveVersion(orgId, agent.id, agent.liveVersion ?? 0),
    enabled: agent.liveVersion !== null,
  })
  // "2 unpublished changes": the working copy against the version that is live, counted here as it
  // is typed. Unknown until the live version has loaded.
  const changeCount = live.data
    ? diffAgentDefinitions(live.data.definition, toSaveableDefinition(draft.definition)).length
    : null

  return {
    t,
    orgId,
    draft,
    activeTab,
    isReadOnly,
    isArchived,
    changeCount,
    name: draft.isNameValid ? draft.meta.name.trim() : agent.name,
    tabs: AGENT_EDITOR_TABS.map((value) => ({
      value,
      label: t(`tabs.${value}`),
      href: ROUTES.workspace.agent(orgSlug, agent.id, value),
    })),
    agentsHref: ROUTES.workspace.agents(orgSlug),
    testHref: ROUTES.workspace.agent(orgSlug, agent.id, 'test'),
    publishHref: ROUTES.workspace.agent(orgSlug, agent.id, 'publish'),
  }
}
