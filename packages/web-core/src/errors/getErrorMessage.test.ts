// SPDX-License-Identifier: AGPL-3.0-only
// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { CLIENT_ERROR_CODES, ERROR_CODES } from '@surefy/contracts'

import { getErrorMessage } from './getErrorMessage'
import { isApiError } from './isApiError'
import { ApiError } from '../http/ApiError'

import type { ErrorsTranslator } from './errors.types'

const MESSAGES: Record<string, string> = {
  [ERROR_CODES.ACCESS_FORBIDDEN]: "You don't have permission to do this.",
  [CLIENT_ERROR_CODES.NETWORK_ERROR]: "Can't reach the server.",
  fallback: 'Something went wrong.',
}

function createTranslator(messages: Record<string, string>): ErrorsTranslator {
  const t = ((key: string) => messages[key] ?? key) as ErrorsTranslator
  t.has = (key) => key in messages
  return t
}

const t = createTranslator(MESSAGES)

describe('isApiError', () => {
  it('recognizes ApiError instances only', () => {
    expect(isApiError(new ApiError(404, ERROR_CODES.NOT_FOUND, 'Not found'))).toBe(true)
    expect(isApiError(new Error('Not found'))).toBe(false)
    expect(isApiError({ status: 404, code: ERROR_CODES.NOT_FOUND })).toBe(false)
    expect(isApiError(null)).toBe(false)
  })
})

describe('getErrorMessage', () => {
  it('translates the code of an ApiError', () => {
    const error = new ApiError(403, ERROR_CODES.ACCESS_FORBIDDEN, 'Forbidden (for logs)')

    expect(getErrorMessage(error, t)).toBe("You don't have permission to do this.")
  })

  it('translates client-side codes too', () => {
    expect(getErrorMessage(ApiError.network(new Error('offline')), t)).toBe(
      "Can't reach the server.",
    )
  })

  it('falls back when the code has no translation', () => {
    const error = new ApiError(409, ERROR_CODES.TEAM_NAME_TAKEN, 'Taken')

    expect(getErrorMessage(error, t)).toBe('Something went wrong.')
  })

  it('falls back for anything that is not an ApiError, never showing its message', () => {
    expect(getErrorMessage(new Error('stack trace details'), t)).toBe('Something went wrong.')
    expect(getErrorMessage('oops', t)).toBe('Something went wrong.')
    expect(getErrorMessage(undefined, t)).toBe('Something went wrong.')
  })
})
