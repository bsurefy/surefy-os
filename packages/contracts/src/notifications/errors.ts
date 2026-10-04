// SPDX-License-Identifier: AGPL-3.0-only
/** Error codes of the notifications domain (UPPER_SNAKE_CASE, <DOMAIN>_<PROBLEM>; never renamed or reused). */
export const NOTIFICATIONS_ERROR_CODES = {
  NOTIFICATION_NOT_FOUND: 'NOTIFICATION_NOT_FOUND', // 404: not one of the current member's notifications
} as const
