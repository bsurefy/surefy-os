// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query'
import { waitFor } from '@testing-library/react'
import { http } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { meKeys, meQueries, useUpdateMeMutation } from '.'
import {
  meFactory,
  mockError,
  mockOk,
  mockPath,
  renderHookWithProviders,
  setupTestServer,
} from '../../testing'

const server = setupTestServer()

describe('me domain', () => {
  it('reads the signed-in person from GET /me under the user scope', async () => {
    const me = meFactory()
    server.use(http.get(mockPath('/me'), () => mockOk(me)))

    const { result } = renderHookWithProviders(() => useQuery(meQueries.current()))

    await waitFor(() => {
      expect(result.current.data).toEqual(me)
    })
    expect(meQueries.current().queryKey).toEqual(['me', 'current'])
  })

  it('patches the profile and puts the answer in the cache', async () => {
    const me = meFactory()
    let body: unknown
    server.use(
      http.patch(mockPath('/me'), async ({ request }) => {
        body = await request.json()
        return mockOk({ ...me, user: { ...me.user, name: 'Sofia' } })
      }),
    )

    const { result, queryClient } = renderHookWithProviders(() => useUpdateMeMutation())
    await result.current.mutateAsync({ name: 'Sofia' })

    expect(body).toEqual({ name: 'Sofia' })
    expect(queryClient.getQueryData(meKeys.current())).toMatchObject({ user: { name: 'Sofia' } })
  })

  it('stays quiet on failure when the caller shows the error itself', async () => {
    server.use(http.patch(mockPath('/me'), () => mockError(422, 'VALIDATION_FAILED', 'Invalid')))
    const showError = vi.fn()

    const { result } = renderHookWithProviders(() => useUpdateMeMutation({ silent: true }), {
      handlers: { showError },
    })

    await expect(result.current.mutateAsync({ name: '' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    })
    expect(showError).not.toHaveBeenCalled()
  })
})
