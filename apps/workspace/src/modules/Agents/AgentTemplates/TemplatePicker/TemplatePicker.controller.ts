// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { agentQueries, useCreateAgentMutation } from '@/api/agents'
import { ROUTES } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import { PERMISSIONS } from '@surefy/contracts'
import type { AgentTemplateDto } from '@surefy/contracts'
import { useCan, useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

/** The key of "Start from scratch" while it creates. */
export const SCRATCH_KEY = 'scratch'

/**
 * The templates and creating an agent from one. "Start from scratch" creates a blank draft; both
 * open the editor on the new agent, and a failure (the plan's agent limit, for one) is shown above
 * the cards.
 */
export function useTemplatePickerController() {
  const t = useTranslations('agents.templates')
  const tErrors = useTranslations('errors')
  const router = useRouter()
  const orgId = useCurrentOrgId()
  const { orgSlug } = useParams<{ orgSlug: string }>()
  // Installing a bridge is an admin's; a Builder's install is a request (bridge.md)
  const canInstallBridges = useCan(PERMISSIONS.AGENTS_MANAGE_ALL)
  const canCreate = useCan(PERMISSIONS.AGENTS_CREATE)
  const templates = useQuery(agentQueries.templates(orgId))
  const create = useCreateAgentMutation(orgId, { silent: true })
  const [creatingKey, setCreatingKey] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)

  const start = async (
    key: string,
    input: { name: string; templateKey?: AgentTemplateDto['key'] },
  ) => {
    setCreatingKey(key)
    setCreateError(null)
    try {
      const agent = await create.mutateAsync(input)
      router.push(toRoute(ROUTES.workspace.agent(orgSlug, agent.id)))
    } catch (error) {
      setCreatingKey(null)
      setCreateError(getErrorMessage(error, tErrors))
    }
  }

  return {
    t,
    canCreate,
    canInstallBridges,
    templates: templates.data?.items ?? [],
    isLoading: templates.isPending,
    errorMessage: templates.error ? getErrorMessage(templates.error, tErrors) : null,
    errorReference: isApiError(templates.error) ? templates.error.requestId : undefined,
    refetch: () => void templates.refetch(),
    creatingKey,
    createError,
    onDismissError: () => {
      setCreateError(null)
    },
    onUse: (template: AgentTemplateDto) =>
      start(template.key, { name: template.name, templateKey: template.key }),
    onStartFromScratch: () => start(SCRATCH_KEY, { name: t('scratch.agentName') }),
  }
}
