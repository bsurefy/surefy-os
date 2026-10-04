// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Query keys of the `dataControl` domain (services-api.md §3): data export and organization
 * deletion. The domain's screen task adds the fetchers, the query options and the mutations next to
 * this file.
 */
export const dataControlKeys = {
  all: (orgId: string) => ['orgs', orgId, 'data-control'] as const,
}
