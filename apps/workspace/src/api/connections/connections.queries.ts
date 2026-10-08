// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Query keys of the `connections` domain (services-api.md §3): connections. The domain's screen task
 * adds the fetchers, the query options and the mutations next to this file.
 */
export const connectionKeys = {
  all: (orgId: string) => ['orgs', orgId, 'connections'] as const,
}
