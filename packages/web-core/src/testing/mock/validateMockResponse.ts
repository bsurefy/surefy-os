// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { errorResponse } from '@surefy/contracts'

import { MockContractError } from './MockContractError'

import type { MockContractErrorInfo } from './MockContractError'

const CLIENT_ERROR_MIN = 400

/**
 * Checks a mocked JSON response against its contract: a success body against the route's schema,
 * an error body against the error envelope. Network errors and non-JSON responses (streams,
 * files, 204) pass through. Throws `MockContractError` when they disagree.
 */
export async function validateMockResponse(
  response: Response,
  schema: z.ZodType,
  context: Omit<MockContractErrorInfo, 'status' | 'issues'>,
): Promise<void> {
  if (response.type === 'error') return
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) return

  const body: unknown = await response.clone().json()
  const result =
    response.status >= CLIENT_ERROR_MIN ? errorResponse.safeParse(body) : schema.safeParse(body)
  if (result.success) return

  throw new MockContractError({
    ...context,
    status: response.status,
    issues: z.prettifyError(result.error),
  })
}
