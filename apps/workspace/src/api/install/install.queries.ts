// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Query keys of the `install` domain (services-api.md §3): install settings and administrators,
 * which belong to the install, not an organization. The domain's screen task adds the fetchers, the
 * query options and the mutations next to this file.
 */
export const installKeys = {
  all: () => ['install'] as const,
}
