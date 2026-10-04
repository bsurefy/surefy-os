// SPDX-License-Identifier: AGPL-3.0-only
import { ApiError } from '../http/ApiError'

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}
