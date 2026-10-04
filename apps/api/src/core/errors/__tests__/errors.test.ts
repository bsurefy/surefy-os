// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { ERROR_CODES } from '@surefy/contracts'

import {
  AppError,
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
  UnauthorizedError,
} from '../index.js'

describe('error classes', () => {
  it('carries code, status, message and the separate client and log payloads', () => {
    const cause = new Error('root')
    const error = new NotFoundError(ERROR_CODES.NOT_FOUND, 'Team not found', {
      details: [{ path: 'teamId' }],
      meta: { teamId: 't1' },
      cause,
    })
    expect(error).toBeInstanceOf(AppError)
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('NotFoundError')
    expect(error.statusCode).toBe(404)
    expect(error.code).toBe('NOT_FOUND')
    expect(error.message).toBe('Team not found')
    expect(error.options.details).toEqual([{ path: 'teamId' }])
    expect(error.options.meta).toEqual({ teamId: 't1' })
    expect(error.cause).toBe(cause)
  })

  it('gives every status class a sensible default code and message', () => {
    expect(new UnauthorizedError()).toMatchObject({ statusCode: 401, code: 'AUTH_UNAUTHENTICATED' })
    expect(new ServiceUnavailableError()).toMatchObject({
      statusCode: 503,
      code: 'SERVICE_UNAVAILABLE',
    })
    expect(new ConflictError(ERROR_CODES.IDEMPOTENCY_KEY_REUSED)).toMatchObject({
      statusCode: 409,
      message: 'Conflict',
    })
  })

  it('names a domain subclass after itself', () => {
    class TeamNotFoundError extends NotFoundError {
      constructor() {
        super(ERROR_CODES.NOT_FOUND, 'Team not found')
      }
    }
    expect(new TeamNotFoundError().name).toBe('TeamNotFoundError')
  })
})
