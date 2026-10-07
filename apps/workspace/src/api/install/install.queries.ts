// SPDX-License-Identifier: AGPL-3.0-only
import { queryOptions } from '@tanstack/react-query'

import { apiClient } from '@surefy/web-core/http'
import type { HttpClient } from '@surefy/web-core/http'

import { installApi } from './install.api'

/**
 * Query keys of the `install` domain (services-api.md §3): install settings and administrators,
 * which belong to the install, not an organization.
 */
export const installKeys = {
  all: () => ['install'] as const,
  settings: () => [...installKeys.all(), 'settings'] as const,
  admins: () => [...installKeys.all(), 'admins'] as const,
  organizations: () => [...installKeys.all(), 'organizations'] as const,
}

// `http` defaults to the browser client; server components pass getServerHttpClient()
export const installQueries = {
  settings: (http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: installKeys.settings(),
      queryFn: ({ signal }) => installApi.settings(http, signal),
    }),
  admins: (http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: installKeys.admins(),
      queryFn: ({ signal }) => installApi.admins(http, signal),
    }),
  organizations: (http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: installKeys.organizations(),
      queryFn: ({ signal }) => installApi.organizations(http, signal),
    }),
}
