// SPDX-License-Identifier: AGPL-3.0-only
import type { CreatePromptInput, PromptDto, UpdatePromptInput } from '@surefy/contracts'
import type { HttpClient } from '@surefy/web-core/http'

import type { PromptListFilters } from './prompts.queries'

/** The prompt library: the person's own prompts and the shared prompts they can see. */
export const promptsApi = {
  list: (http: HttpClient, orgId: string, query: PromptListFilters, signal?: AbortSignal) =>
    http.getPage<PromptDto>(`/orgs/${orgId}/prompts`, { params: { ...query }, signal }),
  create: (http: HttpClient, orgId: string, input: CreatePromptInput) =>
    http.post<PromptDto>(`/orgs/${orgId}/prompts`, input),
  update: (http: HttpClient, orgId: string, promptId: string, input: UpdatePromptInput) =>
    http.patch<PromptDto>(`/orgs/${orgId}/prompts/${promptId}`, input),
  /** Moves the prompt to Recently deleted; `restore` brings it back within 30 days. */
  delete: (http: HttpClient, orgId: string, promptId: string) =>
    http.delete(`/orgs/${orgId}/prompts/${promptId}`),
  restore: (http: HttpClient, orgId: string, promptId: string) =>
    http.post<PromptDto>(`/orgs/${orgId}/prompts/${promptId}/restore`),
}
