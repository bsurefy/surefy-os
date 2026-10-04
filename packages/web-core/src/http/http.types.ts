// SPDX-License-Identifier: AGPL-3.0-only
import type { CLIENT_ERROR_CODES, ErrorCode } from '@surefy/contracts'

export interface RequestOptions {
  params?: Record<string, string | number | boolean | undefined>
  headers?: Record<string, string>
  signal?: AbortSignal
}

/** A list response, unwrapped: the envelope's `data` and `meta.nextCursor`. */
export interface Page<T> {
  items: T[]
  nextCursor: string | null
}

export interface HttpClient {
  get<T>(path: string, options?: RequestOptions): Promise<T>
  getPage<T>(path: string, options?: RequestOptions): Promise<Page<T>>
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>
  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>
  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>
  delete(path: string, options?: RequestOptions): Promise<void>
}

export interface HttpClientConfig {
  getBaseUrl: () => string
  getHeaders?: () => Record<string, string> | Promise<Record<string, string>>
}

/** A code from the API (`ERROR_CODES`) or one the client produces itself. */
export type ApiErrorCode = ErrorCode | (typeof CLIENT_ERROR_CODES)[keyof typeof CLIENT_ERROR_CODES]

/** One field-level problem from a validation-like error: `path` is the field ('name', 'items.3'). */
export interface ErrorDetail {
  path: string
  code: string
  message: string
}
