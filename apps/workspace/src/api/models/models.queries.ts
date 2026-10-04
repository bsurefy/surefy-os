// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Query keys of the `models` domain (services-api.md §3): the models a person may use. The domain's
 * screen task adds the fetchers, the query options and the mutations next to this file.
 */
export const modelKeys = {
  all: (orgId: string) => ['orgs', orgId, 'models'] as const,
}
