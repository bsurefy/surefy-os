// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Query keys of the `approvals` domain (services-api.md §3): the approvals queue. The domain's screen task
 * adds the query options next to this file.
 */
export const approvalKeys = {
  all: (orgId: string) => ['orgs', orgId, 'approvals'] as const,
}
