// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Query keys of the `guard` domain (services-api.md §3): Guard. The domain's screen task
 * adds the fetchers, the query options and the mutations next to this file.
 */
export const guardKeys = {
  all: (orgId: string) => ['orgs', orgId, 'guard'] as const,
}
