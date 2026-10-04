// SPDX-License-Identifier: AGPL-3.0-only
import fp from 'fastify-plugin'
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  type ZodFastifySchemaValidationError,
} from 'fastify-type-provider-zod'

import { AppError, type ErrorDetail } from '@/core/errors/index.js'
import { ERROR_CODES, type ErrorCode, type ErrorResponse } from '@surefy/contracts'

import type { FastifyReply, FastifyRequest } from 'fastify'

/** Fastify and plugin errors with a 4xx status that have their own code. */
const FASTIFY_CLIENT_ERRORS: Record<number, ErrorCode> = {
  401: ERROR_CODES.AUTH_UNAUTHENTICATED,
  403: ERROR_CODES.ACCESS_FORBIDDEN,
  404: ERROR_CODES.NOT_FOUND,
  413: ERROR_CODES.PAYLOAD_TOO_LARGE, // FST_ERR_CTP_BODY_TOO_LARGE, FST_REQ_FILE_TOO_LARGE
  429: ERROR_CODES.RATE_LIMITED, // @fastify/rate-limit
}

/**
 * Field-level details from Fastify's Zod validation errors: `path` in dot notation (the form
 * field names), `code` the Zod issue code, `message` Zod's English text.
 */
export const toErrorDetails = (
  validation: readonly ZodFastifySchemaValidationError[],
): ErrorDetail[] =>
  validation.map((issue) => ({
    path: issue.instancePath.replace(/^\//, '').replaceAll('/', '.'),
    code: issue.keyword,
    message: issue.message ?? 'Invalid value',
  }))

const errorEnvelope = (
  request: FastifyRequest,
  code: ErrorCode,
  message: string,
  details: ErrorDetail[] = [],
): ErrorResponse => ({ error: { code, message, requestId: request.id, details } })

const statusCodeOf = (error: unknown): number | undefined =>
  typeof error === 'object' &&
  error !== null &&
  'statusCode' in error &&
  typeof error.statusCode === 'number'
    ? error.statusCode
    : undefined

/**
 * Turns every error into the standard envelope (error-handling.md, §3): no stack traces, SQL,
 * provider responses or internal messages ever reach a client. Expected client errors log at
 * `info`, server errors at `error`, and every response carries the request ID.
 */
export const errorHandlerPlugin = fp(
  (app) => {
    app.setErrorHandler((error: unknown, request, reply: FastifyReply) => {
      const send = (status: number, code: ErrorCode, message: string, details?: ErrorDetail[]) =>
        reply.status(status).send(errorEnvelope(request, code, message, details))

      if (hasZodFastifySchemaValidationErrors(error)) {
        return send(
          422,
          ERROR_CODES.VALIDATION_FAILED,
          'Request validation failed',
          toErrorDetails(error.validation),
        )
      }

      if (error instanceof AppError) {
        const level = error.statusCode >= 500 ? 'error' : 'info'
        request.log[level]({ err: error, code: error.code, ...error.options.meta }, error.message)
        return send(error.statusCode, error.code, error.message, error.options.details)
      }

      if (typeof error === 'object' && error !== null && isResponseSerializationError(error)) {
        // The reply did not match its response schema: a bug, never the client's fault.
        request.log.error(
          { err: error, issues: error.cause.issues },
          'response serialization failed',
        )
        return send(500, ERROR_CODES.INTERNAL_ERROR, 'Something went wrong')
      }

      // Fastify and plugin client errors: malformed JSON, unsupported media type, body too large…
      const status = statusCodeOf(error) ?? 500
      if (status >= 400 && status < 500) {
        request.log.info({ err: error }, 'client error')
        const message = error instanceof Error ? error.message : 'Bad request'
        return send(status, FASTIFY_CLIENT_ERRORS[status] ?? ERROR_CODES.BAD_REQUEST, message)
      }

      request.log.error({ err: error }, 'unhandled error')
      return send(500, ERROR_CODES.INTERNAL_ERROR, 'Something went wrong')
    })

    app.setNotFoundHandler((request, reply) =>
      reply.status(404).send(errorEnvelope(request, ERROR_CODES.NOT_FOUND, 'Route not found')),
    )
  },
  { name: 'errorHandler' },
)
