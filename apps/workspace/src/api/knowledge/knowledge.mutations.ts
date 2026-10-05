// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQueryClient } from '@tanstack/react-query'

import type {
  BulkKnowledgeSourcesInput,
  CreateKnowledgeBaseInput,
  CreateKnowledgeLinkInput,
  KnowledgeTestSearchInput,
  RequestKnowledgeFileUploadInput,
  RestoreKnowledgeBaseInput,
  RetryKnowledgeSourceInput,
  SetKnowledgeAccessInput,
  SetKnowledgeEmbeddingModelInput,
  UpdateKnowledgeBaseInput,
  UpdateKnowledgeSourceInput,
} from '@surefy/contracts'
import { apiClient } from '@surefy/web-core/http'
import type { MutationHookOptions } from '@surefy/web-core/query'

import { knowledgeBasesApi, knowledgeSourcesApi } from './knowledge.api'
import { knowledgeKeys } from './knowledge.queries'

/** Counters, the KPIs, Recently deleted and the open base all move together, so one prefix refreshes them. */
function useRefreshKnowledge(orgId: string) {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: knowledgeKeys.all(orgId) })
}

export function useCreateKnowledgeBaseMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshKnowledge(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (input: CreateKnowledgeBaseInput) =>
      knowledgeBasesApi.create(apiClient, orgId, input),
    onSuccess: refresh,
  })
}

export function useUpdateKnowledgeBaseMutation(
  orgId: string,
  baseId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshKnowledge(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (input: UpdateKnowledgeBaseInput) =>
      knowledgeBasesApi.update(apiClient, orgId, baseId, input),
    onSuccess: refresh,
  })
}

export function useDeleteKnowledgeBaseMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshKnowledge(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (baseId: string) => knowledgeBasesApi.delete(apiClient, orgId, baseId),
    onSuccess: refresh,
  })
}

export function useRestoreKnowledgeBaseMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshKnowledge(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: ({ baseId, ...input }: RestoreKnowledgeBaseInput & { baseId: string }) =>
      knowledgeBasesApi.restore(apiClient, orgId, baseId, input),
    onSuccess: refresh,
  })
}

export function useReindexKnowledgeBaseMutation(
  orgId: string,
  baseId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshKnowledge(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: () => knowledgeBasesApi.reindex(apiClient, orgId, baseId),
    onSuccess: refresh,
  })
}

export function useSetKnowledgeEmbeddingModelMutation(
  orgId: string,
  baseId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshKnowledge(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (input: SetKnowledgeEmbeddingModelInput) =>
      knowledgeBasesApi.setEmbeddingModel(apiClient, orgId, baseId, input),
    onSuccess: refresh,
  })
}

export function useCancelKnowledgeEmbeddingModelMutation(
  orgId: string,
  baseId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshKnowledge(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: () => knowledgeBasesApi.cancelEmbeddingModel(apiClient, orgId, baseId),
    onSuccess: refresh,
  })
}

export function useSetKnowledgeAccessMutation(
  orgId: string,
  baseId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshKnowledge(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (input: SetKnowledgeAccessInput) =>
      knowledgeBasesApi.setAccess(apiClient, orgId, baseId, input),
    onSuccess: refresh,
  })
}

/** Test search reads only; it is a mutation because it sends a question and is never cached. */
export function useKnowledgeTestSearchMutation(
  orgId: string,
  baseId: string,
  { silent = false }: MutationHookOptions = {},
) {
  return useMutation({
    meta: { silent },
    mutationFn: (input: KnowledgeTestSearchInput) =>
      knowledgeBasesApi.testSearch(apiClient, orgId, baseId, input),
  })
}

// ── Sources ─────────────────────────────────────────────────────────────────────────────────────

/** Creates the file source and its signed upload; nothing refreshes until the bytes are in (`complete`). */
export function useRequestKnowledgeFileUploadMutation(
  orgId: string,
  baseId: string,
  { silent = false }: MutationHookOptions = {},
) {
  return useMutation({
    meta: { silent },
    mutationFn: (input: RequestKnowledgeFileUploadInput) =>
      knowledgeSourcesApi.requestFileUpload(apiClient, orgId, baseId, input),
  })
}

export function useCompleteKnowledgeFileUploadMutation(
  orgId: string,
  baseId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshKnowledge(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (sourceId: string) =>
      knowledgeSourcesApi.complete(apiClient, orgId, baseId, sourceId),
    onSuccess: refresh,
  })
}

export function useCreateKnowledgeLinkMutation(
  orgId: string,
  baseId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshKnowledge(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (input: CreateKnowledgeLinkInput) =>
      knowledgeSourcesApi.createLink(apiClient, orgId, baseId, input),
    onSuccess: refresh,
  })
}

export function useUpdateKnowledgeSourceMutation(
  orgId: string,
  baseId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshKnowledge(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: ({ sourceId, ...input }: UpdateKnowledgeSourceInput & { sourceId: string }) =>
      knowledgeSourcesApi.update(apiClient, orgId, baseId, sourceId, input),
    onSuccess: refresh,
  })
}

export function useDeleteKnowledgeSourceMutation(
  orgId: string,
  baseId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshKnowledge(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (sourceId: string) =>
      knowledgeSourcesApi.delete(apiClient, orgId, baseId, sourceId),
    onSuccess: refresh,
  })
}

export function useRestoreKnowledgeSourceMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshKnowledge(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: ({ baseId, sourceId }: { baseId: string; sourceId: string }) =>
      knowledgeSourcesApi.restore(apiClient, orgId, baseId, sourceId),
    onSuccess: refresh,
  })
}

export function useRetryKnowledgeSourceMutation(
  orgId: string,
  baseId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshKnowledge(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: ({ sourceId, ...input }: RetryKnowledgeSourceInput & { sourceId: string }) =>
      knowledgeSourcesApi.retry(apiClient, orgId, baseId, sourceId, input),
    onSuccess: refresh,
  })
}

export function useSyncKnowledgeSourceMutation(
  orgId: string,
  baseId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshKnowledge(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (sourceId: string) => knowledgeSourcesApi.sync(apiClient, orgId, baseId, sourceId),
    onSuccess: refresh,
  })
}

export function useBulkKnowledgeSourcesMutation(
  orgId: string,
  baseId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshKnowledge(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (input: BulkKnowledgeSourcesInput) =>
      knowledgeSourcesApi.bulk(apiClient, orgId, baseId, input),
    onSuccess: refresh,
  })
}

export function useDownloadKnowledgeDocumentMutation(
  orgId: string,
  baseId: string,
  { silent = false }: MutationHookOptions = {},
) {
  return useMutation({
    meta: { silent },
    mutationFn: (documentId: string) =>
      knowledgeSourcesApi.download(apiClient, orgId, baseId, documentId),
  })
}
