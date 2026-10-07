// SPDX-License-Identifier: AGPL-3.0-only
/** Error codes of the teams domain (UPPER_SNAKE_CASE, <DOMAIN>_<PROBLEM>; never renamed or reused). */
export const TEAMS_ERROR_CODES = {
  TEAM_NAME_TAKEN: 'TEAM_NAME_TAKEN',
  TEAM_NOT_FOUND: 'TEAM_NOT_FOUND',
  TEAM_LEAD_NOT_A_MEMBER: 'TEAM_LEAD_NOT_A_MEMBER', // 422: the lead must belong to the team
  TEAM_MEMBER_NOT_FOUND: 'TEAM_MEMBER_NOT_FOUND', // 404: the person is not in this team
  TEAM_HAS_CONNECTIONS: 'TEAM_HAS_CONNECTIONS', // 409: deletion needs the `connections` decision
} as const
