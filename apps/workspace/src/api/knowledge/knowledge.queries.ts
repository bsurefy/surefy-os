// SPDX-License-Identifier: AGPL-3.0-only
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'

import { PAGE_SIZE } from '@surefy/contracts'
import type { KnowledgeBaseDto, KnowledgeSourceDto } from '@surefy/contracts'
import { apiClient } from '@surefy/web-core/http'
import type { HttpClient } from '@surefy/web-core/http'

import { knowledgeBasesApi, knowledgeSourcesApi } from './knowledge.api'

/** Filters are single-valued: `HttpClient` params carry no arrays. */
export interface KnowledgePageFilters {
  limit?: number
  cursor?: string
}

export interface KnowledgeBaseListFilters extends KnowledgePageFilters {
  q?: string
  isLocalOnly?: boolean
  needsAttention?: boolean
  /** `name`, `updatedAt`, `deletedAt`, with a leading `-` for descending. */
  sort?: string
}

export interface DeletedKnowledgeFilters extends KnowledgePageFilters {
  q?: string
  kind?: 'knowledge_base' | 'source'
}

export interface KnowledgeSourceListFilters extends KnowledgePageFilters {
  q?: string
  type?: 'file' | 'link' | 'connector'
  status?: string
  /** `createdAt`, `name`, `sizeBytes`, with a leading `-` for descending. */
  sort?: string
}

export interface KnowledgeDocumentListFilters extends KnowledgePageFilters {
  status?: string
}

/** How often a base or source that is still being processed is asked again. */
export const ACTIVE_POLL_MS = 3000

const IN_PROGRESS_SOURCE = new Set(['uploading', 'queued', 'processing'])

/** True while any loaded source is uploading, queued or processing. */
export function hasSourceInProgress(sources: readonly KnowledgeSourceDto[]): boolean {
  return sources.some((source) => IN_PROGRESS_SOURCE.has(source.status))
}

function hasBaseInProgress(bases: readonly KnowledgeBaseDto[]): boolean {
  return bases.some((base) => base.reindex !== null || base.processing.inProgress > 0)
}

/** Query keys of the `knowledge` domain (services-api.md §3): bases, sources, documents and test search. */
export const knowledgeKeys = {
  all: (orgId: string) => ['orgs', orgId, 'knowledge'] as const,
  summary: (orgId: string) => [...knowledgeKeys.all(orgId), 'summary'] as const,
  deleted: (orgId: string, filters: DeletedKnowledgeFilters) =>
    [...knowledgeKeys.all(orgId), 'deleted', filters] as const,
  lists: (orgId: string) => [...knowledgeKeys.all(orgId), 'list'] as const,
  list: (orgId: string, filters: KnowledgeBaseListFilters) =>
    [...knowledgeKeys.lists(orgId), filters] as const,
  detail: (orgId: string, baseId: string) => [...knowledgeKeys.all(orgId), 'base', baseId] as const,
  impact: (orgId: string, baseId: string) =>
    [...knowledgeKeys.detail(orgId, baseId), 'impact'] as const,
  reindexImpact: (orgId: string, baseId: string, modelKey: string | undefined) =>
    [...knowledgeKeys.detail(orgId, baseId), 'reindex-impact', modelKey] as const,
  access: (orgId: string, baseId: string) =>
    [...knowledgeKeys.detail(orgId, baseId), 'access'] as const,
  accessImpact: (orgId: string, baseId: string, teamId: string) =>
    [...knowledgeKeys.access(orgId, baseId), 'impact', teamId] as const,
  source: (orgId: string, baseId: string, sourceId: string) =>
    [...knowledgeKeys.detail(orgId, baseId), 'source', sourceId] as const,
  sources: (orgId: string, baseId: string, filters: KnowledgeSourceListFilters) =>
    [...knowledgeKeys.detail(orgId, baseId), 'sources', filters] as const,
  documents: (
    orgId: string,
    baseId: string,
    sourceId: string,
    filters: KnowledgeDocumentListFilters,
  ) => [...knowledgeKeys.detail(orgId, baseId), 'source', sourceId, 'documents', filters] as const,
  document: (orgId: string, baseId: string, documentId: string) =>
    [...knowledgeKeys.detail(orgId, baseId), 'document', documentId] as const,
  documentPages: (orgId: string, baseId: string, documentId: string) =>
    [...knowledgeKeys.document(orgId, baseId, documentId), 'pages'] as const,
}

const firstPage = { initialPageParam: undefined as string | undefined }

// `http` defaults to the browser client; server components pass getServerHttpClient()
export const knowledgeQueries = {
  summary: (orgId: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: knowledgeKeys.summary(orgId),
      queryFn: ({ signal }) => knowledgeBasesApi.summary(http, orgId, signal),
    }),
  deleted: (orgId: string, filters: DeletedKnowledgeFilters, http: HttpClient = apiClient) =>
    infiniteQueryOptions({
      queryKey: knowledgeKeys.deleted(orgId, filters),
      queryFn: ({ pageParam, signal }) =>
        knowledgeBasesApi.deleted(
          http,
          orgId,
          { ...filters, limit: filters.limit ?? PAGE_SIZE.default, cursor: pageParam },
          signal,
        ),
      ...firstPage,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  list: (orgId: string, filters: KnowledgeBaseListFilters, http: HttpClient = apiClient) =>
    infiniteQueryOptions({
      queryKey: knowledgeKeys.list(orgId, filters),
      queryFn: ({ pageParam, signal }) =>
        knowledgeBasesApi.list(
          http,
          orgId,
          { ...filters, limit: filters.limit ?? PAGE_SIZE.default, cursor: pageParam },
          signal,
        ),
      ...firstPage,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      // the processing bars move while sources are being indexed
      refetchInterval: (query) =>
        hasBaseInProgress(query.state.data?.pages.flatMap((page) => page.items) ?? [])
          ? ACTIVE_POLL_MS
          : false,
    }),
  detail: (orgId: string, baseId: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: knowledgeKeys.detail(orgId, baseId),
      queryFn: ({ signal }) => knowledgeBasesApi.get(http, orgId, baseId, signal),
      refetchInterval: (query) =>
        query.state.data && hasBaseInProgress([query.state.data]) ? ACTIVE_POLL_MS : false,
    }),
  impact: (orgId: string, baseId: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: knowledgeKeys.impact(orgId, baseId),
      queryFn: ({ signal }) => knowledgeBasesApi.impact(http, orgId, baseId, signal),
      // the names must be the ones at the moment of confirming
      gcTime: 0,
    }),
  reindexImpact: (
    orgId: string,
    baseId: string,
    modelKey: string | undefined,
    http: HttpClient = apiClient,
  ) =>
    queryOptions({
      queryKey: knowledgeKeys.reindexImpact(orgId, baseId, modelKey),
      queryFn: ({ signal }) =>
        knowledgeBasesApi.reindexImpact(http, orgId, baseId, modelKey, signal),
      gcTime: 0,
    }),
  access: (orgId: string, baseId: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: knowledgeKeys.access(orgId, baseId),
      queryFn: ({ signal }) => knowledgeBasesApi.access(http, orgId, baseId, signal),
    }),
  accessImpact: (orgId: string, baseId: string, teamId: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: knowledgeKeys.accessImpact(orgId, baseId, teamId),
      queryFn: ({ signal }) => knowledgeBasesApi.accessImpact(http, orgId, baseId, teamId, signal),
      gcTime: 0,
    }),
  sources: (
    orgId: string,
    baseId: string,
    filters: KnowledgeSourceListFilters,
    http: HttpClient = apiClient,
  ) =>
    infiniteQueryOptions({
      queryKey: knowledgeKeys.sources(orgId, baseId, filters),
      queryFn: ({ pageParam, signal }) =>
        knowledgeSourcesApi.list(
          http,
          orgId,
          baseId,
          { ...filters, limit: filters.limit ?? PAGE_SIZE.default, cursor: pageParam },
          signal,
        ),
      ...firstPage,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      // progress moves while sources are processed; stop asking once they settle
      refetchInterval: (query) =>
        hasSourceInProgress(query.state.data?.pages.flatMap((page) => page.items) ?? [])
          ? ACTIVE_POLL_MS
          : false,
    }),
  source: (orgId: string, baseId: string, sourceId: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: knowledgeKeys.source(orgId, baseId, sourceId),
      queryFn: ({ signal }) => knowledgeSourcesApi.get(http, orgId, baseId, sourceId, signal),
    }),
  documents: (
    orgId: string,
    baseId: string,
    sourceId: string,
    filters: KnowledgeDocumentListFilters,
    http: HttpClient = apiClient,
  ) =>
    infiniteQueryOptions({
      queryKey: knowledgeKeys.documents(orgId, baseId, sourceId, filters),
      queryFn: ({ pageParam, signal }) =>
        knowledgeSourcesApi.documents(
          http,
          orgId,
          baseId,
          sourceId,
          { ...filters, limit: filters.limit ?? PAGE_SIZE.default, cursor: pageParam },
          signal,
        ),
      ...firstPage,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  document: (orgId: string, baseId: string, documentId: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: knowledgeKeys.document(orgId, baseId, documentId),
      queryFn: ({ signal }) =>
        knowledgeSourcesApi.document(http, orgId, baseId, documentId, signal),
    }),
  documentPages: (
    orgId: string,
    baseId: string,
    documentId: string,
    http: HttpClient = apiClient,
  ) =>
    infiniteQueryOptions({
      queryKey: knowledgeKeys.documentPages(orgId, baseId, documentId),
      queryFn: ({ pageParam, signal }) =>
        knowledgeSourcesApi.documentPages(
          http,
          orgId,
          baseId,
          documentId,
          { cursor: pageParam },
          signal,
        ),
      ...firstPage,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
}
