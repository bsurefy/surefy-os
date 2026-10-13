// SPDX-License-Identifier: AGPL-3.0-only
import type {
  ApiKeyCreatedDto,
  ApiKeyDto,
  ApiKeyImpactDto,
  CreateApiKeyInput,
  UpdateApiKeyInput,
} from '@surefy/contracts'
import type { HttpClient } from '@surefy/web-core/http'

import type { ApiKeyListFilters } from './apiKeys.queries'

/** Organization API keys (Settings › API keys). */
export const apiKeysApi = {
  list: (http: HttpClient, orgId: string, query: ApiKeyListFilters, signal?: AbortSignal) =>
    http.getPage<ApiKeyDto>(`/orgs/${orgId}/api-keys`, { params: { ...query }, signal }),
  /** The only response that carries the full key. Needs a fresh session. */
  create: (http: HttpClient, orgId: string, input: CreateApiKeyInput) =>
    http.post<ApiKeyCreatedDto>(`/orgs/${orgId}/api-keys`, input),
  rename: (http: HttpClient, orgId: string, keyId: string, input: UpdateApiKeyInput) =>
    http.patch<ApiKeyDto>(`/orgs/${orgId}/api-keys/${keyId}`, input),
  impact: (http: HttpClient, orgId: string, keyId: string, signal?: AbortSignal) =>
    http.get<ApiKeyImpactDto>(`/orgs/${orgId}/api-keys/${keyId}/impact`, { signal }),
  revoke: (http: HttpClient, orgId: string, keyId: string) =>
    http.post<ApiKeyDto>(`/orgs/${orgId}/api-keys/${keyId}/revoke`),
}
