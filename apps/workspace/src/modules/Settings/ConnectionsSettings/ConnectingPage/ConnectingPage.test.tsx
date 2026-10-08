// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { connectionsApi } from '@/api/connections'
import { appMessages } from '@/test/messages'
import { ORG_ID, seededShellClient } from '@/test/shell'
import { apiClient } from '@surefy/web-core/http'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import ConnectingPage from './ConnectingPage'
import { connectionsDomain, resetConnectionsMock } from '../../../../../mock/handlers/connections'

const router = vi.hoisted(() => ({ replace: vi.fn() }))
const search = vi.hoisted(() => ({ value: '' }))

vi.mock('next/navigation', () => ({
  useParams: () => ({ orgSlug: 'acme' }),
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(search.value),
}))

const server = setupTestServer(...connectionsDomain.handlers)

/** Starts a sign-in the way Add connection does, so the callback has a state to complete. */
async function startSignIn(returnTo?: string) {
  const started = await connectionsApi.startOauth(apiClient, ORG_ID, {
    providerKey: 'google-drive',
    scope: 'organization',
    returnTo,
  })
  return started.state
}

function renderCallback(params: string) {
  search.value = params
  return renderWithProviders(<ConnectingPage />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(),
  })
}

beforeEach(() => {
  resetConnectionsMock()
  router.replace.mockClear()
})

afterEach(() => {
  server.events.removeAllListeners()
})

describe('ConnectingPage', () => {
  it('completes the connection and returns to where the person started', async () => {
    const state = await startSignIn('/acme/agents/new')
    renderCallback(`?state=${state}&code=abc`)
    expect(screen.getByText('Connecting…')).toBeVisible()
    expect(await screen.findByText('Connected maya@acme.test')).toBeVisible()
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/acme/agents/new')
    })
  })

  it('returns to the connections when the sign-in started there', async () => {
    const state = await startSignIn()
    renderCallback(`?state=${state}&code=abc`)
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/acme/settings/connections')
    })
  })

  it('says the app’s message when the person declined, and saves nothing', async () => {
    const state = await startSignIn()
    renderCallback(`?state=${state}&error=access_denied&error_description=The+user+said+no`)
    expect(await screen.findByText("The app didn't finish connecting")).toBeVisible()
    expect(screen.getByText('The user said no')).toBeVisible()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('says when the sign-in took too long', async () => {
    renderCallback('?state=mock-state-unknown&code=abc')
    expect(await screen.findByText('That sign-in took too long')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Start again' })).toBeVisible()
  })

  it('treats a return without a state as an expired attempt', async () => {
    renderCallback('')
    expect(await screen.findByText('That sign-in took too long')).toBeVisible()
  })

  it('takes the person back to the connections to start again', async () => {
    const { user } = renderCallback('')
    await user.click(await screen.findByRole('button', { name: 'Start again' }))
    expect(router.replace).toHaveBeenCalledWith('/acme/settings/connections')
  })

  it('reports a different account on a reconnect', async () => {
    const state = await startSignIn()
    server.events.on('request:start', ({ request }) => {
      if (request.url.includes('/oauth/complete')) {
        request.headers.set('x-mock-scenario', 'account-mismatch')
      }
    })
    renderCallback(`?state=${state}&code=abc`)
    expect(await screen.findByText("Couldn't finish connecting")).toBeVisible()
    expect(screen.getByText(/You signed in to a different account/)).toBeVisible()
  })
})
