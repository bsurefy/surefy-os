// SPDX-License-Identifier: AGPL-3.0-only
import { delay, HttpResponse } from 'msw'

import { ERROR_CODES } from '@surefy/contracts'

import { getMockSettings } from './mockSettings'
import { mockError, mockOffline, pageBody } from './responses'

import type { Scenario } from './mock.constants'
import type { z } from 'zod'

const HTTP_FORBIDDEN = 403
const HTTP_INTERNAL_ERROR = 500

/**
 * The answer of a shared scenario when the handler does not define its own (states.md §2):
 * `slow` waits and then answers the default, `empty` answers an empty page (a single-resource
 * route has no empty state, so it answers the default), the rest are the designed failures.
 */
export async function builtinScenarioResponse(
  scenario: Scenario,
  schema: z.ZodType,
  resolveDefault: () => Promise<Response>,
): Promise<Response> {
  switch (scenario) {
    case 'default': {
      return resolveDefault()
    }
    case 'slow': {
      await delay(getMockSettings().slowDelayMs)
      return resolveDefault()
    }
    case 'empty': {
      const empty = pageBody([])
      return schema.safeParse(empty).success ? HttpResponse.json(empty) : resolveDefault()
    }
    case 'error': {
      return mockError(HTTP_INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, 'Something went wrong')
    }
    case 'forbidden': {
      return mockError(
        HTTP_FORBIDDEN,
        ERROR_CODES.ACCESS_FORBIDDEN,
        'You do not have access to this resource',
      )
    }
    case 'gated': {
      return mockError(
        HTTP_FORBIDDEN,
        ERROR_CODES.FEATURE_NOT_AVAILABLE,
        'This feature is not available in your edition',
      )
    }
    case 'limit': {
      return mockError(HTTP_FORBIDDEN, ERROR_CODES.LIMIT_REACHED, 'You have reached a limit', {
        details: [{ limit: 'items', source: 'plan' }],
      })
    }
    case 'offline': {
      return mockOffline()
    }
  }
}
