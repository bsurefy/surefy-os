// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Query keys of the `organizations` domain (services-api.md §3): the organization's own settings.
 * The domain's screen task adds the fetchers, the query options and the mutations next to this
 * file.
 */
export const organizationKeys = {
  all: (orgId: string) => ['orgs', orgId, 'organizations'] as const,
}
