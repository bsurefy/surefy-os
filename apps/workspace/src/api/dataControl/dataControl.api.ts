// SPDX-License-Identifier: AGPL-3.0-only
import type {
  CreateDataRequestInput,
  DataRequestDto,
  DataRetentionDto,
  DownloadLinkDto,
} from '@surefy/contracts'
import type { HttpClient } from '@surefy/web-core/http'

import type { DataRequestFilters } from './dataControl.queries'

/** Data requests (export all data, delete the organization) and the retention overview. */
export const dataControlApi = {
  requests: (http: HttpClient, orgId: string, query: DataRequestFilters, signal?: AbortSignal) =>
    http.getPage<DataRequestDto>(`/orgs/${orgId}/data-requests`, { params: { ...query }, signal }),
  create: (http: HttpClient, orgId: string, input: CreateDataRequestInput) =>
    http.post<DataRequestDto>(`/orgs/${orgId}/data-requests`, input),
  cancel: (http: HttpClient, orgId: string, requestId: string) =>
    http.post<DataRequestDto>(`/orgs/${orgId}/data-requests/${requestId}/cancel`),
  retry: (http: HttpClient, orgId: string, requestId: string) =>
    http.post<DataRequestDto>(`/orgs/${orgId}/data-requests/${requestId}/retry`),
  /** A signed link issued on click; each download is audited. */
  download: (http: HttpClient, orgId: string, requestId: string) =>
    http.post<DownloadLinkDto>(`/orgs/${orgId}/data-requests/${requestId}/download`),
  retention: (http: HttpClient, orgId: string, signal?: AbortSignal) =>
    http.get<DataRetentionDto>(`/orgs/${orgId}/data-control/retention`, { signal }),
}
