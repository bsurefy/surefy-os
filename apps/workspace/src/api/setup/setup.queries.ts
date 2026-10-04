// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Query keys of the `setup` domain (services-api.md §3): the first-run status, before any
 * organization exists. The domain's screen task adds the fetchers, the query options and the
 * mutations next to this file.
 */
export const setupKeys = {
  all: () => ['setup'] as const,
}
