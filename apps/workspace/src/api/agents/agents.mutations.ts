// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { AgentDetailDto, SaveAgentDraftInput, UpdateAgentInput } from '@surefy/contracts'
import { apiClient } from '@surefy/web-core/http'
import type { MutationHookOptions } from '@surefy/web-core/query'

import { agentsApi } from './agents.api'
import { agentKeys } from './agents.queries'

/**
 * Saves the name or the description. The detail in the cache takes the answer; the lists are read
 * again. Autosave calls it `silent`: the editor shows the failure in its save status.
 */
export function useUpdateAgentMutation(
  orgId: string,
  agentId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: (input: UpdateAgentInput) => agentsApi.update(apiClient, orgId, agentId, input),
    onSuccess: (agent) => {
      queryClient.setQueryData<AgentDetailDto>(agentKeys.detail(orgId, agentId), (detail) =>
        detail ? { ...detail, ...agent, draft: detail.draft, channels: detail.channels } : detail,
      )
      return queryClient.invalidateQueries({ queryKey: agentKeys.lists(orgId) })
    },
  })
}

/**
 * Autosave of the draft. On success the cached detail takes the saved definition and the new
 * revision, so the editor opened again later starts from what was saved. A conflict is the
 * caller's to handle (`silent`).
 */
export function useSaveAgentDraftMutation(
  orgId: string,
  agentId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: (input: SaveAgentDraftInput) =>
      agentsApi.saveDraft(apiClient, orgId, agentId, input),
    onSuccess: (saved, input) => {
      queryClient.setQueryData<AgentDetailDto>(agentKeys.detail(orgId, agentId), (detail) =>
        detail
          ? {
              ...detail,
              hasUnpublishedChanges: saved.hasUnpublishedChanges,
              draft: {
                ...detail.draft,
                definition: input.definition,
                revision: saved.revision,
                updatedAt: saved.updatedAt,
              },
            }
          : detail,
      )
      return queryClient.invalidateQueries({ queryKey: agentKeys.lists(orgId) })
    },
  })
}
