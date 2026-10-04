// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Query keys of the `audit` domain (services-api.md §3): the audit log. The domain's screen task
 * adds the fetchers, the query options and the mutations next to this file.
 */
export const auditKeys = {
  all: (orgId: string) => ['orgs', orgId, 'audit'] as const,
}
