// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQueryClient } from '@tanstack/react-query'

import type {
  AgentDetailDto,
  AgentLifecycleAction,
  CreateAgentInput,
  DeleteAgentQuery,
  DiscoverMcpActionsInput,
  DuplicateAgentInput,
  PublishAgentInput,
  ReplaceAgentAccessInput,
  SaveAgentDraftInput,
  TestAgentToolInput,
  UpdateAgentChannelInput,
  UpdateAgentInput,
} from '@surefy/contracts'
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

/**
 * Publishes the draft. The agent is read again, because a publish changes its live version, its
 * channels and the draft's revision; the caller reads the new revision from it.
 */
export function usePublishAgentMutation(
  orgId: string,
  agentId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: (input: PublishAgentInput) => agentsApi.publish(apiClient, orgId, agentId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: agentKeys.detail(orgId, agentId) })
      await queryClient.invalidateQueries({ queryKey: agentKeys.lists(orgId) })
    },
  })
}

/** Rolls back to an earlier version: the live version changes, the draft does not. */
export function useRollbackAgentMutation(
  orgId: string,
  agentId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: (versionId: string) => agentsApi.rollback(apiClient, orgId, agentId, { versionId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: agentKeys.detail(orgId, agentId) })
      await queryClient.invalidateQueries({ queryKey: agentKeys.lists(orgId) })
    },
  })
}

/** A channel changed: the agent is read again for its channels, the lists for "Needs attention". */
function useChannelChanged(orgId: string, agentId: string) {
  const queryClient = useQueryClient()
  return async () => {
    await queryClient.invalidateQueries({ queryKey: agentKeys.detail(orgId, agentId) })
    await queryClient.invalidateQueries({ queryKey: agentKeys.lists(orgId) })
  }
}

/** Saves a live channel's settings (Admins). */
export function useUpdateAgentChannelMutation(
  orgId: string,
  agentId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const onSuccess = useChannelChanged(orgId, agentId)
  return useMutation({
    meta: { silent },
    mutationFn: ({ channelId, input }: { channelId: string; input: UpdateAgentChannelInput }) =>
      agentsApi.updateChannel(apiClient, orgId, agentId, channelId, input),
    onSuccess,
  })
}

/** Pauses a live channel, or resumes it (a channel in error once its connection works again). */
export function useAgentChannelActionMutation(
  orgId: string,
  agentId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const onSuccess = useChannelChanged(orgId, agentId)
  return useMutation({
    meta: { silent },
    mutationFn: ({ channelId, action }: { channelId: string; action: 'pause' | 'resume' }) =>
      agentsApi.channelAction(apiClient, orgId, agentId, channelId, action),
    onSuccess,
  })
}

/** A new widget token, in the answer once; the previous one stops working. */
export function useRotateAgentChannelTokenMutation(
  orgId: string,
  agentId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const onSuccess = useChannelChanged(orgId, agentId)
  return useMutation({
    meta: { silent },
    mutationFn: (channelId: string) =>
      agentsApi.rotateChannelToken(apiClient, orgId, agentId, channelId),
    onSuccess,
  })
}

/** Turns a channel off, or takes back a request that waits for an admin. */
export function useRemoveAgentChannelMutation(
  orgId: string,
  agentId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const onSuccess = useChannelChanged(orgId, agentId)
  return useMutation({
    meta: { silent },
    mutationFn: (channelId: string) =>
      agentsApi.removeChannel(apiClient, orgId, agentId, channelId),
    onSuccess,
  })
}

/** Saves the audience at once; a model that an added team may not use is refused. */
export function useReplaceAgentAccessMutation(
  orgId: string,
  agentId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: (input: ReplaceAgentAccessInput) =>
      agentsApi.replaceAccess(apiClient, orgId, agentId, input),
    onSuccess: async (access) => {
      queryClient.setQueryData(agentKeys.access(orgId, agentId), access)
      // "Model allowed for every audience" depends on who the agent is shared with
      await queryClient.invalidateQueries({ queryKey: agentKeys.readiness(orgId, agentId) })
      await queryClient.invalidateQueries({ queryKey: agentKeys.lists(orgId) })
    },
  })
}

/** Tries an API tool as it stands in the editor. Nothing is stored; the dialog shows the answer. */
export function useTestAgentToolMutation(orgId: string, agentId: string) {
  return useMutation({
    meta: { silent: true },
    mutationFn: (input: TestAgentToolInput) => agentsApi.testTool(apiClient, orgId, agentId, input),
  })
}

/** Connects to an MCP server and lists its actions. Nothing is stored; the dialog shows the answer. */
export function useDiscoverMcpActionsMutation(orgId: string, agentId: string) {
  return useMutation({
    meta: { silent: true },
    mutationFn: (input: DiscoverMcpActionsInput) =>
      agentsApi.discoverMcpActions(apiClient, orgId, agentId, input),
  })
}

/** Creates an agent from a template or from scratch; the lists are read again. */
export function useCreateAgentMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: (input: CreateAgentInput) => agentsApi.create(apiClient, orgId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: agentKeys.lists(orgId) }),
  })
}

/** A draft copy of the agent, owned by the caller. */
export function useDuplicateAgentMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: ({ agentId, ...input }: DuplicateAgentInput & { agentId: string }) =>
      agentsApi.duplicate(apiClient, orgId, agentId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: agentKeys.lists(orgId) }),
  })
}

/** Pause, resume, archive or restore. The agent and the lists are read again. */
export function useAgentLifecycleMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: ({
      agentId,
      action,
    }: {
      agentId: string
      action: Exclude<AgentLifecycleAction, 'delete'>
    }) => agentsApi.lifecycle(apiClient, orgId, agentId, action),
    onSuccess: async (_agent, { agentId }) => {
      await queryClient.invalidateQueries({ queryKey: agentKeys.detail(orgId, agentId) })
      await queryClient.invalidateQueries({ queryKey: agentKeys.lists(orgId) })
    },
  })
}

/** Deletes the agent; a published one or one with runs also sends the typed name and the reason. */
export function useDeleteAgentMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: ({ agentId, ...query }: DeleteAgentQuery & { agentId: string }) =>
      agentsApi.remove(apiClient, orgId, agentId, query),
    onSuccess: (_result, { agentId }) => {
      queryClient.removeQueries({ queryKey: agentKeys.detail(orgId, agentId) })
      return queryClient.invalidateQueries({ queryKey: agentKeys.lists(orgId) })
    },
  })
}
