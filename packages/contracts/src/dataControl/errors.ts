// SPDX-License-Identifier: AGPL-3.0-only
/** Error codes of the dataControl domain (UPPER_SNAKE_CASE, <DOMAIN>_<PROBLEM>; never renamed or reused). */
export const DATA_CONTROL_ERROR_CODES = {
  DATA_REQUEST_NOT_FOUND: 'DATA_REQUEST_NOT_FOUND',
  DATA_REQUEST_DELETION_PENDING: 'DATA_REQUEST_DELETION_PENDING', // 409: a deletion is already requested or scheduled
  DATA_REQUEST_NOT_CANCELABLE: 'DATA_REQUEST_NOT_CANCELABLE', // 409: only requested or scheduled requests can be canceled
  DATA_REQUEST_NOT_RETRYABLE: 'DATA_REQUEST_NOT_RETRYABLE', // 409: only failed exports can be retried
  DATA_REQUEST_NOT_READY: 'DATA_REQUEST_NOT_READY', // 409: the archive is not ready or has expired
  EXPORT_NOT_FOUND: 'EXPORT_NOT_FOUND',
  EXPORT_NOT_READY: 'EXPORT_NOT_READY', // 409: the file is not ready or has expired
  EXPORT_NOT_RETRYABLE: 'EXPORT_NOT_RETRYABLE', // 409: only failed or expired exports can be prepared again
} as const
