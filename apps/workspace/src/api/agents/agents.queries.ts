// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Query keys of the `agents` domain (services-api.md §3): the agents. The domain's screen task
 * adds the fetchers, the query options and the mutations next to this file.
 */
export const agentKeys = {
  all: (orgId: string) => ['orgs', orgId, 'agents'] as const,
}
