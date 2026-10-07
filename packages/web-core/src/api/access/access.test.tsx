// SPDX-License-Identifier: AGPL-3.0-only
import { QueryClient, useQuery } from '@tanstack/react-query'
import { waitFor } from '@testing-library/react'
import { http } from 'msw'
import { describe, expect, it } from 'vitest'

import { accessKeys, accessQueries, allAccessQueries, EFFECTIVE_ACCESS_STALE_TIME } from '.'
import {
  effectiveAccessFactory,
  fixtureUuid,
  mockOk,
  mockPath,
  renderHookWithProviders,
  setupTestServer,
} from '../../testing'

const server = setupTestServer()
const ORG_ID = fixtureUuid(2, 1)

describe('access domain', () => {
  it('reads effective access for one organization under its scope', async () => {
    const access = effectiveAccessFactory()
    server.use(http.get(mockPath(`/orgs/${ORG_ID}/access/me`), () => mockOk(access)))

    const { result } = renderHookWithProviders(() => useQuery(accessQueries.me(ORG_ID)))

    await waitFor(() => {
      expect(result.current.data).toEqual(access)
    })
    expect(accessQueries.me(ORG_ID).queryKey).toEqual(['orgs', ORG_ID, 'access', 'me'])
    expect(accessQueries.me(ORG_ID).staleTime).toBe(EFFECTIVE_ACCESS_STALE_TIME)
  })

  it('invalidates the access queries of every organization, and nothing else', async () => {
    const queryClient = new QueryClient()
    const otherOrg = fixtureUuid(2, 2)
    queryClient.setQueryData(accessKeys.me(ORG_ID), effectiveAccessFactory())
    queryClient.setQueryData(accessKeys.me(otherOrg), effectiveAccessFactory())
    queryClient.setQueryData(['orgs', ORG_ID, 'agents', 'list'], [])

    await queryClient.invalidateQueries(allAccessQueries)

    const isInvalidated = (queryKey: readonly unknown[]) =>
      queryClient.getQueryState(queryKey)?.isInvalidated
    expect(isInvalidated(accessKeys.me(ORG_ID))).toBe(true)
    expect(isInvalidated(accessKeys.me(otherOrg))).toBe(true)
    expect(isInvalidated(['orgs', ORG_ID, 'agents', 'list'])).toBe(false)
  })
})
