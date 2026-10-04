// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Query keys of the `knowledge` domain (services-api.md §3): knowledge bases, sources and test
 * search. The domain's screen task adds the fetchers, the query options and the mutations next to
 * this file.
 */
export const knowledgeKeys = {
  all: (orgId: string) => ['orgs', orgId, 'knowledge'] as const,
}
