// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Query keys of the `members` domain (services-api.md §3): members and invitations. The domain's
 * screen task adds the fetchers, the query options and the mutations next to this file.
 */
export const memberKeys = {
  all: (orgId: string) => ['orgs', orgId, 'members'] as const,
}
