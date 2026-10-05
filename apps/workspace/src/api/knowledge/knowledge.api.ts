// SPDX-License-Identifier: AGPL-3.0-only
import type {
  BulkKnowledgeSourcesInput,
  BulkKnowledgeSourcesResultDto,
  CreateKnowledgeBaseInput,
  CreateKnowledgeLinkInput,
  DeletedKnowledgeItemDto,
  DownloadLinkDto,
  KnowledgeAccessDto,
  KnowledgeAccessImpactDto,
  KnowledgeBaseDto,
  KnowledgeBaseImpactDto,
  KnowledgeDocumentDetailDto,
  KnowledgeDocumentDto,
  KnowledgeDocumentPageDto,
  KnowledgeFileUploadDto,
  KnowledgeReindexImpactDto,
  KnowledgeSourceDto,
  KnowledgeSummaryDto,
  KnowledgeTestSearchDto,
  KnowledgeTestSearchInput,
  RequestKnowledgeFileUploadInput,
  RestoreKnowledgeBaseInput,
  RetryKnowledgeSourceInput,
  SetKnowledgeAccessInput,
  SetKnowledgeEmbeddingModelInput,
  UpdateKnowledgeBaseInput,
  UpdateKnowledgeSourceInput,
} from '@surefy/contracts'
import type { HttpClient } from '@surefy/web-core/http'

import type {
  DeletedKnowledgeFilters,
  KnowledgeBaseListFilters,
  KnowledgeDocumentListFilters,
  KnowledgePageFilters,
  KnowledgeSourceListFilters,
} from './knowledge.queries'

const bases = (orgId: string) => `/orgs/${orgId}/knowledge-bases`
const base = (orgId: string, baseId: string) => `${bases(orgId)}/${baseId}`

/** Knowledge bases, their access and embedding model (Knowledge). */
export const knowledgeBasesApi = {
  summary: (http: HttpClient, orgId: string, signal?: AbortSignal) =>
    http.get<KnowledgeSummaryDto>(`/orgs/${orgId}/knowledge/summary`, { signal }),
  deleted: (
    http: HttpClient,
    orgId: string,
    query: DeletedKnowledgeFilters,
    signal?: AbortSignal,
  ) =>
    http.getPage<DeletedKnowledgeItemDto>(`/orgs/${orgId}/knowledge/recently-deleted`, {
      params: { ...query },
      signal,
    }),
  list: (http: HttpClient, orgId: string, query: KnowledgeBaseListFilters, signal?: AbortSignal) =>
    http.getPage<KnowledgeBaseDto>(bases(orgId), { params: { ...query }, signal }),
  get: (http: HttpClient, orgId: string, baseId: string, signal?: AbortSignal) =>
    http.get<KnowledgeBaseDto>(base(orgId, baseId), { signal }),
  create: (http: HttpClient, orgId: string, input: CreateKnowledgeBaseInput) =>
    http.post<KnowledgeBaseDto>(bases(orgId), input),
  update: (http: HttpClient, orgId: string, baseId: string, input: UpdateKnowledgeBaseInput) =>
    http.patch<KnowledgeBaseDto>(base(orgId, baseId), input),
  /** Moves the base to Recently deleted; `restore` brings it back within 30 days. */
  delete: (http: HttpClient, orgId: string, baseId: string) => http.delete(base(orgId, baseId)),
  impact: (http: HttpClient, orgId: string, baseId: string, signal?: AbortSignal) =>
    http.get<KnowledgeBaseImpactDto>(`${base(orgId, baseId)}/impact`, { signal }),
  restore: (http: HttpClient, orgId: string, baseId: string, input: RestoreKnowledgeBaseInput) =>
    http.post<KnowledgeBaseDto>(`${base(orgId, baseId)}/restore`, input),
  reindex: (http: HttpClient, orgId: string, baseId: string) =>
    http.post<KnowledgeBaseDto>(`${base(orgId, baseId)}/reindex`),
  reindexImpact: (
    http: HttpClient,
    orgId: string,
    baseId: string,
    modelKey: string | undefined,
    signal?: AbortSignal,
  ) =>
    http.get<KnowledgeReindexImpactDto>(`${base(orgId, baseId)}/reindex-impact`, {
      params: { modelKey },
      signal,
    }),
  setEmbeddingModel: (
    http: HttpClient,
    orgId: string,
    baseId: string,
    input: SetKnowledgeEmbeddingModelInput,
  ) => http.put<KnowledgeBaseDto>(`${base(orgId, baseId)}/embedding-model`, input),
  cancelEmbeddingModel: (http: HttpClient, orgId: string, baseId: string) =>
    http.delete(`${base(orgId, baseId)}/embedding-model`),
  access: (http: HttpClient, orgId: string, baseId: string, signal?: AbortSignal) =>
    http.get<KnowledgeAccessDto>(`${base(orgId, baseId)}/access`, { signal }),
  setAccess: (http: HttpClient, orgId: string, baseId: string, input: SetKnowledgeAccessInput) =>
    http.put<KnowledgeAccessDto>(`${base(orgId, baseId)}/access`, input),
  accessImpact: (
    http: HttpClient,
    orgId: string,
    baseId: string,
    teamId: string,
    signal?: AbortSignal,
  ) =>
    http.get<KnowledgeAccessImpactDto>(`${base(orgId, baseId)}/access/impact`, {
      params: { teamId },
      signal,
    }),
  testSearch: (http: HttpClient, orgId: string, baseId: string, input: KnowledgeTestSearchInput) =>
    http.post<KnowledgeTestSearchDto>(`${base(orgId, baseId)}/test-search`, input),
}

/** Sources, documents and their preview (Knowledge › Sources, Source preview). */
export const knowledgeSourcesApi = {
  list: (
    http: HttpClient,
    orgId: string,
    baseId: string,
    query: KnowledgeSourceListFilters,
    signal?: AbortSignal,
  ) =>
    http.getPage<KnowledgeSourceDto>(`${base(orgId, baseId)}/sources`, {
      params: { ...query },
      signal,
    }),
  get: (http: HttpClient, orgId: string, baseId: string, sourceId: string, signal?: AbortSignal) =>
    http.get<KnowledgeSourceDto>(`${base(orgId, baseId)}/sources/${sourceId}`, { signal }),
  /** Creates the source and its signed upload; the bytes go to storage, then `complete`. */
  requestFileUpload: (
    http: HttpClient,
    orgId: string,
    baseId: string,
    input: RequestKnowledgeFileUploadInput,
  ) => http.post<KnowledgeFileUploadDto>(`${base(orgId, baseId)}/sources/files`, input),
  complete: (http: HttpClient, orgId: string, baseId: string, sourceId: string) =>
    http.post<KnowledgeSourceDto>(`${base(orgId, baseId)}/sources/${sourceId}/complete`),
  createLink: (http: HttpClient, orgId: string, baseId: string, input: CreateKnowledgeLinkInput) =>
    http.post<KnowledgeSourceDto>(`${base(orgId, baseId)}/sources/links`, input),
  update: (
    http: HttpClient,
    orgId: string,
    baseId: string,
    sourceId: string,
    input: UpdateKnowledgeSourceInput,
  ) => http.patch<KnowledgeSourceDto>(`${base(orgId, baseId)}/sources/${sourceId}`, input),
  /** Moves the source to Recently deleted; `restore` brings it back within 30 days. */
  delete: (http: HttpClient, orgId: string, baseId: string, sourceId: string) =>
    http.delete(`${base(orgId, baseId)}/sources/${sourceId}`),
  restore: (http: HttpClient, orgId: string, baseId: string, sourceId: string) =>
    http.post<KnowledgeSourceDto>(`${base(orgId, baseId)}/sources/${sourceId}/restore`),
  retry: (
    http: HttpClient,
    orgId: string,
    baseId: string,
    sourceId: string,
    input: RetryKnowledgeSourceInput,
  ) => http.post<KnowledgeSourceDto>(`${base(orgId, baseId)}/sources/${sourceId}/retry`, input),
  sync: (http: HttpClient, orgId: string, baseId: string, sourceId: string) =>
    http.post<KnowledgeSourceDto>(`${base(orgId, baseId)}/sources/${sourceId}/sync`),
  bulk: (http: HttpClient, orgId: string, baseId: string, input: BulkKnowledgeSourcesInput) =>
    http.post<BulkKnowledgeSourcesResultDto>(`${base(orgId, baseId)}/sources/bulk`, input),
  documents: (
    http: HttpClient,
    orgId: string,
    baseId: string,
    sourceId: string,
    query: KnowledgeDocumentListFilters,
    signal?: AbortSignal,
  ) =>
    http.getPage<KnowledgeDocumentDto>(`${base(orgId, baseId)}/sources/${sourceId}/documents`, {
      params: { ...query },
      signal,
    }),
  document: (
    http: HttpClient,
    orgId: string,
    baseId: string,
    documentId: string,
    signal?: AbortSignal,
  ) =>
    http.get<KnowledgeDocumentDetailDto>(`${base(orgId, baseId)}/documents/${documentId}`, {
      signal,
    }),
  documentPages: (
    http: HttpClient,
    orgId: string,
    baseId: string,
    documentId: string,
    query: KnowledgePageFilters,
    signal?: AbortSignal,
  ) =>
    http.getPage<KnowledgeDocumentPageDto>(`${base(orgId, baseId)}/documents/${documentId}/pages`, {
      params: { ...query },
      signal,
    }),
  download: (http: HttpClient, orgId: string, baseId: string, documentId: string) =>
    http.post<DownloadLinkDto>(`${base(orgId, baseId)}/documents/${documentId}/download`),
}
