// SPDX-License-Identifier: AGPL-3.0-only

export const SERVER_DIALOG = {
  ADD: 'add',
  REMOVE: 'remove',
  DISABLE_MODEL: 'disable-model',
} as const
export type ServerDialogKind = (typeof SERVER_DIALOG)[keyof typeof SERVER_DIALOG]
