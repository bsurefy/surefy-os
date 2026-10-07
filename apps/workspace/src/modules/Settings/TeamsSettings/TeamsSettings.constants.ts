// SPDX-License-Identifier: AGPL-3.0-only

export const TEAM_SORTS = ['name', '-name', 'createdAt', '-createdAt'] as const
export type TeamSort = (typeof TEAM_SORTS)[number]

/** Names for the lead column and the member pickers come from the first page of this size. */
export const PEOPLE_LOOKUP_LIMIT = 100

export const TEAM_DIALOG = {
  CREATE: 'create',
  EDIT: 'edit',
  DELETE: 'delete',
} as const
export type TeamDialogKind = (typeof TEAM_DIALOG)[keyof typeof TEAM_DIALOG]
