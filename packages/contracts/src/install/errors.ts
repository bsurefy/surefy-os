// SPDX-License-Identifier: AGPL-3.0-only
/** Error codes of the install domain (UPPER_SNAKE_CASE, <DOMAIN>_<PROBLEM>; never renamed or reused). */
export const INSTALL_ERROR_CODES = {
  INSTALL_ADMIN_REQUIRED: 'INSTALL_ADMIN_REQUIRED', // 403: the person is not an install administrator
  INSTALL_ADMIN_EXISTS: 'INSTALL_ADMIN_EXISTS', // 409: already an install administrator
  INSTALL_LAST_ADMIN: 'INSTALL_LAST_ADMIN', // 409: at least one install administrator must remain
  INSTALL_SMTP_NOT_CONFIGURED: 'INSTALL_SMTP_NOT_CONFIGURED', // 409: test email without SMTP settings
  INSTALL_SMTP_TEST_FAILED: 'INSTALL_SMTP_TEST_FAILED', // 502: the mail server refused the test message
} as const
