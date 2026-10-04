// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Query keys of the `teams` domain (services-api.md §3): teams and their members. The domain's
 * screen task adds the fetchers, the query options and the mutations next to this file.
 */
export const teamKeys = {
  all: (orgId: string) => ['orgs', orgId, 'teams'] as const,
}
