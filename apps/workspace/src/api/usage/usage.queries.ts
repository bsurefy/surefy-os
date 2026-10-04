// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Query keys of the `usage` domain (services-api.md §3): usage and cost for Insights. The domain's
 * screen task adds the fetchers, the query options and the mutations next to this file.
 */
export const usageKeys = {
  all: (orgId: string) => ['orgs', orgId, 'usage'] as const,
}
