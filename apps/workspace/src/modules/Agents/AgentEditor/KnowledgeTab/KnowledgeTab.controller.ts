// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { knowledgeQueries } from '@/api/knowledge'
import { ROUTES } from '@/constants/routes'
import { AGENT_KNOWLEDGE_BASES_MAX } from '@surefy/contracts'
import { useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { KNOWLEDGE_LOOKUP_LIMIT } from '../AgentEditor.constants'

import type { KnowledgeTabProps } from './KnowledgeTab.types'

/**
 * Knowledge: the bases the agent may search, chosen from the ones the person can manage, and how
 * it uses them (cite sources, answer only from them).
 */
export function useKnowledgeTabController({ definition, onDefinitionChange }: KnowledgeTabProps) {
  const t = useTranslations('agents.editor.knowledge')
  const tErrors = useTranslations('errors')
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const orgId = useCurrentOrgId()
  const { knowledge } = definition
  const query = useInfiniteQuery(knowledgeQueries.list(orgId, { limit: KNOWLEDGE_LOOKUP_LIMIT }))
  const bases = query.data?.pages.flatMap((page) => page.items) ?? []
  // An agent can be given only bases its builder can manage
  const manageable = bases.filter((base) => base.effectiveLevel === 'manage')
  const attachedIds = knowledge.knowledgeBaseIds
  // Bases the person cannot see any more stay listed, so they can be removed
  const attached = attachedIds.map((id) => ({
    id,
    base: bases.find((candidate) => candidate.id === id) ?? null,
  }))
  const addable = manageable.filter((base) => !attachedIds.includes(base.id))

  const update = (patch: Partial<typeof knowledge>) => {
    onDefinitionChange((current) => ({
      ...current,
      knowledge: { ...current.knowledge, ...patch },
    }))
  }

  return {
    t,
    isLoading: query.isPending,
    errorMessage: query.error ? getErrorMessage(query.error, tErrors) : null,
    errorReference: isApiError(query.error) ? query.error.requestId : undefined,
    refetch: () => void query.refetch(),
    attached,
    addOptions: addable.map((base) => ({
      value: base.id,
      label: base.name,
      description: t('sourceCount', { count: base.sourceCount }),
    })),
    hasManageableBases: manageable.length > 0,
    canAdd: attachedIds.length < AGENT_KNOWLEDGE_BASES_MAX && addable.length > 0,
    citeSources: knowledge.citeSources,
    onlyFromKnowledge: knowledge.onlyFromKnowledge,
    knowledgeHref: ROUTES.workspace.knowledge(orgSlug),
    onAdd: (baseId: string | null) => {
      if (baseId !== null) update({ knowledgeBaseIds: [...attachedIds, baseId] })
    },
    onRemove: (baseId: string) => {
      update({ knowledgeBaseIds: attachedIds.filter((id) => id !== baseId) })
    },
    onCiteSourcesChange: (citeSources: boolean) => {
      update({ citeSources })
    },
    onOnlyFromKnowledgeChange: (onlyFromKnowledge: boolean) => {
      update({ onlyFromKnowledge })
    },
  }
}
