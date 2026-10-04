// SPDX-License-Identifier: AGPL-3.0-only
// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { getQueryClient } from './getQueryClient'

// Outside a React render, `cache()` has no request scope, so each call stands for a new request.
describe('getQueryClient on the server', () => {
  it('creates a client per request, without handlers', () => {
    const first = getQueryClient()
    const second = getQueryClient()

    expect(first).not.toBe(second)
    expect(first.getDefaultOptions().queries?.staleTime).toBe(30_000)
  })
})
