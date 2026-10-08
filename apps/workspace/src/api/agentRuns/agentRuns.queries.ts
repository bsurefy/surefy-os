// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Query keys of the `agentRuns` domain (services-api.md §3): agent runs. The domain's screen task
 * adds the fetchers, the query options and the mutations next to this file.
 */
export const agentRunKeys = {
  all: (orgId: string) => ['orgs', orgId, 'agent-runs'] as const,
}
