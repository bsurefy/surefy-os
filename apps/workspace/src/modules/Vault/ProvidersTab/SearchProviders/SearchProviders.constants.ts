// SPDX-License-Identifier: AGPL-3.0-only

export const SEARCH_DIALOG = {
  ADD: 'add',
  SWITCH: 'switch',
  REVOKE: 'revoke',
} as const
export type SearchDialogKind = (typeof SEARCH_DIALOG)[keyof typeof SEARCH_DIALOG]
