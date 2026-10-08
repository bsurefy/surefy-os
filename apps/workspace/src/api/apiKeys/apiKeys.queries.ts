// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Query keys of the `apiKeys` domain (services-api.md §3): organization API keys. The domain's screen task
 * adds the fetchers, the query options and the mutations next to this file.
 */
export const apiKeyKeys = {
  all: (orgId: string) => ['orgs', orgId, 'api-keys'] as const,
}
