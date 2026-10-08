// SPDX-License-Identifier: AGPL-3.0-only
import type {
  CompleteOauthInput,
  ConnectionCheckDto,
  ConnectionDto,
  ConnectionImpactDto,
  ConnectionProviderDto,
  CreateConnectionInput,
  OauthCompleteDto,
  OauthStartDto,
  ReconnectConnectionInput,
  StartOauthInput,
  UpdateConnectionInput,
} from '@surefy/contracts'
import type { HttpClient } from '@surefy/web-core/http'

import type { ConnectionListFilters } from './connections.queries'

const base = (orgId: string) => `/orgs/${orgId}/connections`

/** Connections to other apps (Settings › Connections and the pickers of tools, channels, sources). */
export const connectionsApi = {
  providers: (http: HttpClient, orgId: string, signal?: AbortSignal) =>
    http.get<ConnectionProviderDto[]>(`${base(orgId)}/providers`, { signal }),
  list: (
    http: HttpClient,
    orgId: string,
    { status = [], ...query }: ConnectionListFilters,
    signal?: AbortSignal,
  ) => {
    // the client sends one value per key: a status filter that repeats travels in the path
    const statuses = new URLSearchParams(status.map((value) => ['status', value]))
    const suffix = statuses.size > 0 ? `?${statuses.toString()}` : ''
    return http.getPage<ConnectionDto>(`${base(orgId)}${suffix}`, {
      params: { ...query },
      signal,
    })
  },
  /** Runs the provider check first: a failed check stores nothing. */
  create: (http: HttpClient, orgId: string, input: CreateConnectionInput) =>
    http.post<ConnectionDto>(base(orgId), input),
  update: (http: HttpClient, orgId: string, id: string, input: UpdateConnectionInput) =>
    http.patch<ConnectionDto>(`${base(orgId)}/${id}`, input),
  impact: (http: HttpClient, orgId: string, id: string, signal?: AbortSignal) =>
    http.get<ConnectionImpactDto>(`${base(orgId)}/${id}/impact`, { signal }),
  /** New credentials for a connection that is not an authorization code sign-in. */
  reconnect: (http: HttpClient, orgId: string, id: string, input: ReconnectConnectionInput) =>
    http.post<ConnectionDto>(`${base(orgId)}/${id}/reconnect`, input),
  test: (http: HttpClient, orgId: string, id: string) =>
    http.post<ConnectionCheckDto>(`${base(orgId)}/${id}/test`),
  /** Disconnects: revokes the grant at the app when it supports that. */
  revoke: (http: HttpClient, orgId: string, id: string) =>
    http.post<ConnectionDto>(`${base(orgId)}/${id}/revoke`),
  startOauth: (http: HttpClient, orgId: string, input: StartOauthInput) =>
    http.post<OauthStartDto>(`${base(orgId)}/oauth/start`, input),
  completeOauth: (http: HttpClient, orgId: string, input: CompleteOauthInput) =>
    http.post<OauthCompleteDto>(`${base(orgId)}/oauth/complete`, input),
}
