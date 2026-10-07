// SPDX-License-Identifier: AGPL-3.0-only
import type { AuditEntryDto, AuditIntegrityStatusDto } from '@surefy/contracts'
import type { HttpClient } from '@surefy/web-core/http'

import type { AuditEntryListFilters } from './audit.queries'

/** The organization's audit log (Guard › Audit log): entries, integrity and verification. */
export const auditApi = {
  list: (http: HttpClient, orgId: string, query: AuditEntryListFilters, signal?: AbortSignal) =>
    http.getPage<AuditEntryDto>(`/orgs/${orgId}/audit/entries`, { params: { ...query }, signal }),
  get: (http: HttpClient, orgId: string, entryId: string, signal?: AbortSignal) =>
    http.get<AuditEntryDto>(`/orgs/${orgId}/audit/entries/${entryId}`, { signal }),
  integrity: (http: HttpClient, orgId: string, signal?: AbortSignal) =>
    http.get<AuditIntegrityStatusDto>(`/orgs/${orgId}/audit/integrity`, { signal }),
  /** 202: the check runs in the background; the answer is the status at the start. */
  verify: (http: HttpClient, orgId: string) =>
    http.post<AuditIntegrityStatusDto>(`/orgs/${orgId}/audit/verify`),
}
