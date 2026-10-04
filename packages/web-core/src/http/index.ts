// SPDX-License-Identifier: AGPL-3.0-only
// Browser-safe entry. The server instance lives behind `@surefy/web-core/http/server`.
export { ApiError } from './ApiError'
export { apiClient } from './apiClient'
export { createHttpClient } from './createHttpClient'
export { API_PREFIX } from './http.constants'
export type {
  ApiErrorCode,
  ErrorDetail,
  HttpClient,
  HttpClientConfig,
  Page,
  RequestOptions,
} from './http.types'
