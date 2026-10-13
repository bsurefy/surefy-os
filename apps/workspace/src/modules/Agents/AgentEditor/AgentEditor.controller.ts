// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { agentQueries } from '@/api/agents'
import { ROUTES } from '@/constants/routes'
import { ERROR_CODES } from '@surefy/contracts'
import { useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { getAgentEditorTab } from './AgentEditor.utils'

/** The agent behind the editor, as the route names it, and the tab that is open. */
export function useAgentEditorController() {
  const t = useTranslations('agents.editor')
  const tErrors = useTranslations('errors')
  const { orgSlug, agentId, tab } = useParams<{ orgSlug: string; agentId: string; tab?: string }>()
  const orgId = useCurrentOrgId()
  const query = useQuery(agentQueries.detail(orgId, agentId))

  return {
    t,
    orgId,
    orgSlug,
    agent: query.data,
    activeTab: getAgentEditorTab(tab),
    isLoading: query.isPending,
    isNotFound: isApiError(query.error) && query.error.code === ERROR_CODES.AGENT_NOT_FOUND,
    errorMessage: query.error ? getErrorMessage(query.error, tErrors) : null,
    errorReference: isApiError(query.error) ? query.error.requestId : undefined,
    refetch: () => void query.refetch(),
    agentsHref: ROUTES.workspace.agents(orgSlug),
  }
}
