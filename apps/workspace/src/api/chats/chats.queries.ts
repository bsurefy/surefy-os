// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Query keys of the `chats` domain (services-api.md §3): chats, folders and messages. The domain's
 * screen task adds the fetchers, the query options and the mutations next to this file.
 */
export const chatKeys = {
  all: (orgId: string) => ['orgs', orgId, 'chats'] as const,
}
