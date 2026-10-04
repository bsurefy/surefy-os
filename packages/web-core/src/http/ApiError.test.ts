// SPDX-License-Identifier: AGPL-3.0-only
// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { CLIENT_ERROR_CODES, ERROR_CODES } from '@surefy/contracts'

import { ApiError } from './ApiError'

const envelope = {
  error: {
    code: ERROR_CODES.VALIDATION_FAILED,
    message: 'Validation failed',
    requestId: 'req_1',
    details: [{ path: 'name', code: 'too_small', message: 'Too short' }],
  },
}

describe('ApiError.fromResponse', () => {
  it('reads status, code, message, details and requestId from the error envelope', () => {
    const error = ApiError.fromResponse(400, envelope)

    expect(error).toBeInstanceOf(ApiError)
    expect(error.name).toBe('ApiError')
    expect(error.status).toBe(400)
    expect(error.code).toBe(ERROR_CODES.VALIDATION_FAILED)
    expect(error.message).toBe('Validation failed')
    expect(error.requestId).toBe('req_1')
    expect(error.details).toEqual([{ path: 'name', code: 'too_small', message: 'Too short' }])
  })

  it('keeps only the field-level shape of each detail and drops malformed ones', () => {
    const error = ApiError.fromResponse(400, {
      error: {
        ...envelope.error,
        details: [
          { path: 'name', code: 'too_small', message: 'Too short', extra: true },
          { code: 'missing_path' },
        ],
      },
    })

    expect(error.details).toEqual([{ path: 'name', code: 'too_small', message: 'Too short' }])
  })

  it.each([
    ['no body', null],
    ['an HTML page', '<html>Bad gateway</html>'],
    ['another JSON shape', { message: 'nope' }],
  ])('becomes UNKNOWN_ERROR with the status when the payload is %s', (_label, payload) => {
    const error = ApiError.fromResponse(502, payload)

    expect(error.status).toBe(502)
    expect(error.code).toBe(CLIENT_ERROR_CODES.UNKNOWN_ERROR)
    expect(error.details).toEqual([])
    expect(error.requestId).toBeUndefined()
  })

  it('reports a code the contracts do not know as UNKNOWN_ERROR, keeping the rest', () => {
    const error = ApiError.fromResponse(409, {
      error: { code: 'SOMETHING_NEW', message: 'New', requestId: 'req_2', details: [] },
    })

    expect(error.code).toBe(CLIENT_ERROR_CODES.UNKNOWN_ERROR)
    expect(error.message).toBe('New')
    expect(error.requestId).toBe('req_2')
  })
})

describe('ApiError.network', () => {
  it('has status 0, NETWORK_ERROR and the cause', () => {
    const cause = new TypeError('Failed to fetch')
    const error = ApiError.network(cause)

    expect(error.status).toBe(0)
    expect(error.code).toBe(CLIENT_ERROR_CODES.NETWORK_ERROR)
    expect(error.message).toBe('Failed to fetch')
    expect(error.cause).toBe(cause)
  })

  it('falls back to a generic message when the cause is not an Error', () => {
    expect(ApiError.network('offline').message).toBe('Network request failed')
  })
})
