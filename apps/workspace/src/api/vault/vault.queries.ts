// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Query keys of the `vault` domain (services-api.md §3): provider keys, local servers, model access
 * and fallback. The domain's screen task adds the fetchers, the query options and the mutations
 * next to this file.
 */
export const vaultKeys = {
  all: (orgId: string) => ['orgs', orgId, 'vault'] as const,
}
