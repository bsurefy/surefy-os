// SPDX-License-Identifier: AGPL-3.0-only

export const KEY_SCOPES_FILTER = ['organization', 'team', 'personal'] as const

export const KEY_DIALOG = {
  ADD: 'add',
  ROTATE: 'rotate',
  SWITCH: 'switch',
  REVOKE: 'revoke',
} as const
export type KeyDialogKind = (typeof KEY_DIALOG)[keyof typeof KEY_DIALOG]
