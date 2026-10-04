// SPDX-License-Identifier: AGPL-3.0-only
/** Error codes of the teams domain (UPPER_SNAKE_CASE, <DOMAIN>_<PROBLEM>; never renamed or reused). */
export const TEAMS_ERROR_CODES = {
  TEAM_NAME_TAKEN: 'TEAM_NAME_TAKEN',
  TEAM_NOT_FOUND: 'TEAM_NOT_FOUND',
} as const
