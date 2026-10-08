// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import {
  connectionsDomain,
  resetConnectionsMock,
} from '../../../../../../mock/handlers/connections'
import { resetTeamsMock, teamsDomain } from '../../../../../../mock/handlers/teams'
import ConnectionsSettings from '../../ConnectionsSettings'
import { goToExternalUrl } from '../../ConnectionsSettings.navigation'

vi.mock('next/navigation', () => ({ useParams: () => ({ orgSlug: 'acme' }) }))
vi.mock('../../ConnectionsSettings.navigation', () => ({ goToExternalUrl: vi.fn() }))

const server = setupTestServer(...connectionsDomain.handlers, ...teamsDomain.handlers)

function renderConnections(role: 'owner' | 'admin' | 'builder' = 'admin') {
  return renderWithProviders(<ConnectionsSettings />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs(role)),
  })
}

/** Forces a scenario on the requests whose URL contains `part`. */
function useScenarioFor(part: string, scenario: string) {
  server.events.on('request:start', ({ request }) => {
    if (request.url.includes(part)) request.headers.set('x-mock-scenario', scenario)
  })
}

type User = ReturnType<typeof renderConnections>['user']

async function openAdd(user: User) {
  await user.click(await screen.findByRole('button', { name: 'Add connection' }))
  return screen.findByRole('dialog', { name: 'Add connection' })
}

/** Step 1 to 3 for a custom API with an API key. */
async function fillCustomApi(user: User, dialog: HTMLElement) {
  await user.click(await within(dialog).findByRole('button', { name: 'Custom API' }))
  const signIn = await screen.findByRole('dialog', { name: 'Connect Custom API' })
  await user.type(within(signIn).getByLabelText('Name'), 'Stripe')
  await user.type(within(signIn).getByLabelText('Address'), 'https://api.stripe.test')
  await user.type(within(signIn).getByLabelText('API key'), 'sk_live_1234567890abcd')
  await user.click(within(signIn).getByRole('button', { name: 'Next' }))
  return screen.findByRole('radiogroup', { name: 'Who can use it' })
}

beforeEach(() => {
  resetConnectionsMock()
  resetTeamsMock()
  vi.mocked(goToExternalUrl).mockClear()
})

afterEach(() => {
  server.events.removeAllListeners()
})

describe('AddConnectionDialog', () => {
  it('offers the apps grouped by use', async () => {
    const { user } = renderConnections()
    const dialog = await openAdd(user)
    expect(within(dialog).getByText('Step 1 of 3')).toBeVisible()
    expect(await within(dialog).findByRole('region', { name: 'Knowledge sources' })).toBeVisible()
    expect(within(dialog).getByRole('region', { name: 'Channels' })).toBeVisible()
    expect(within(dialog).getByRole('region', { name: 'Tools' })).toBeVisible()
    for (const app of ['Google Drive', 'Notion', 'Slack', 'WhatsApp', 'Custom API', 'MCP server']) {
      expect(within(dialog).getByRole('button', { name: app })).toBeEnabled()
    }
  })

  it('filters the apps by search', async () => {
    const { user } = renderConnections()
    const dialog = await openAdd(user)
    await user.type(await within(dialog).findByRole('searchbox', { name: 'Search apps' }), 'slack')
    expect(within(dialog).getByRole('button', { name: 'Slack' })).toBeVisible()
    expect(within(dialog).queryByRole('button', { name: 'Notion' })).not.toBeInTheDocument()
    await user.clear(within(dialog).getByRole('searchbox', { name: 'Search apps' }))
    await user.type(within(dialog).getByRole('searchbox', { name: 'Search apps' }), 'zzz')
    expect(within(dialog).getByText('No app matches your search.')).toBeVisible()
  })

  it('disables an app whose sign-in is not set up on this install', async () => {
    useScenarioFor('/providers', 'oauth-not-configured')
    const { user } = renderConnections()
    const dialog = await openAdd(user)
    const slack = await within(dialog).findByRole('button', { name: 'Slack' })
    expect(slack).toBeDisabled()
    expect(within(slack).getByText(/Not set up on this install/)).toBeVisible()
    // Notion still takes a token, and a custom API takes a key
    expect(within(dialog).getByRole('button', { name: 'Notion' })).toBeEnabled()
    expect(within(dialog).getByRole('button', { name: 'Custom API' })).toBeEnabled()
  })

  it('connects a custom API with a key and lists it', async () => {
    const { user } = renderConnections()
    const dialog = await openAdd(user)
    const scope = await fillCustomApi(user, dialog)
    // Admins may share it; Just me is the default
    expect(within(scope).getByRole('radio', { name: /Just me/ })).toBeChecked()
    expect(within(scope).getByRole('radio', { name: /A team/ })).toBeVisible()
    expect(within(scope).getByRole('radio', { name: /Organization/ })).toBeVisible()
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Connect Custom API' })).getByRole(
        'button',
        {
          name: 'Connect',
        },
      ),
    )
    expect(await screen.findByText('Connected Stripe')).toBeVisible()
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Connect Custom API' })).not.toBeInTheDocument()
    })
    const row = (await screen.findByText('Stripe')).closest('tr')
    expect(row).toHaveTextContent('…abcd')
    expect(row).toHaveTextContent('Just me')
  })

  it('needs the fields of the chosen way of signing in', async () => {
    const { user } = renderConnections()
    const dialog = await openAdd(user)
    await user.click(await within(dialog).findByRole('button', { name: 'Custom API' }))
    const signIn = await screen.findByRole('dialog', { name: 'Connect Custom API' })
    await user.click(within(signIn).getByRole('button', { name: 'Next' }))
    expect((await within(signIn).findAllByText('This field is required.')).length).toBeGreaterThan(
      1,
    )
    expect(within(signIn).getByText('Step 2 of 3')).toBeVisible()
  })

  it('keeps what was typed when going back from the last step', async () => {
    const { user } = renderConnections()
    const dialog = await openAdd(user)
    await fillCustomApi(user, dialog)
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByLabelText('Name')).toHaveValue('Stripe')
    expect(screen.getByLabelText('Address')).toHaveValue('https://api.stripe.test')
  })

  it('can go back to choose another app', async () => {
    const { user } = renderConnections()
    const dialog = await openAdd(user)
    await user.click(await within(dialog).findByRole('button', { name: 'Custom API' }))
    await user.click(await screen.findByRole('button', { name: 'Back' }))
    expect(await screen.findByText('Step 1 of 3')).toBeVisible()
  })

  it('shows the app’s reason when the check fails and stores nothing', async () => {
    useScenarioFor('/connections', 'provider-rejected')
    const { user } = renderConnections()
    const dialog = await openAdd(user)
    await fillCustomApi(user, dialog)
    await user.click(screen.getByRole('button', { name: 'Connect' }))
    expect(await screen.findByText(/The app rejected these credentials/)).toBeVisible()
    expect(screen.getByRole('dialog', { name: 'Connect Custom API' })).toBeVisible()
    expect(screen.queryByText('Stripe')).not.toBeInTheDocument()
  })

  it('says when no one answers at the address', async () => {
    useScenarioFor('/connections', 'unreachable')
    const { user } = renderConnections()
    const dialog = await openAdd(user)
    await fillCustomApi(user, dialog)
    await user.click(screen.getByRole('button', { name: 'Connect' }))
    expect(await screen.findByText(/Nothing answered at this address/)).toBeVisible()
  })

  it('says when an address is not allowed', async () => {
    useScenarioFor('/connections', 'base-url-not-allowed')
    const { user } = renderConnections()
    const dialog = await openAdd(user)
    await fillCustomApi(user, dialog)
    await user.click(screen.getByRole('button', { name: 'Connect' }))
    expect(await screen.findByText(/This address isn't allowed/)).toBeVisible()
  })

  it('does not add an account twice and points to the connections', async () => {
    useScenarioFor('/connections', 'duplicate')
    const { user } = renderConnections()
    const dialog = await openAdd(user)
    await fillCustomApi(user, dialog)
    await user.click(screen.getByRole('button', { name: 'Connect' }))
    expect(await screen.findByText(/This account is already connected here/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Show connections' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Connect Custom API' })).not.toBeInTheDocument()
    })
  })

  it('needs a team to be picked for a team connection', async () => {
    const { user } = renderConnections()
    const dialog = await openAdd(user)
    const scope = await fillCustomApi(user, dialog)
    await user.click(within(scope).getByRole('radio', { name: /A team/ }))
    expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled()
    await user.click(await screen.findByRole('combobox', { name: 'Team' }))
    await user.click(await screen.findByRole('option', { name: 'Support' }))
    expect(screen.getByRole('button', { name: 'Connect' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Connect' }))
    const row = (await screen.findByText('Stripe')).closest('tr')
    expect(row).toHaveTextContent('Support')
  })

  it('offers a Builder only Just me', async () => {
    const { user } = renderConnections('builder')
    const dialog = await openAdd(user)
    const scope = await fillCustomApi(user, dialog)
    expect(within(scope).getByRole('radio', { name: /Just me/ })).toBeChecked()
    expect(within(scope).queryByRole('radio', { name: /A team/ })).not.toBeInTheDocument()
    expect(within(scope).queryByRole('radio', { name: /Organization/ })).not.toBeInTheDocument()
  })

  it('sends an OAuth sign-in to the app after asking who can use it', async () => {
    const { user } = renderConnections()
    const dialog = await openAdd(user)
    await user.click(await within(dialog).findByRole('button', { name: 'Google Drive' }))
    const signIn = await screen.findByRole('dialog', { name: 'Connect Google Drive' })
    // the name is optional: it defaults to the account's
    expect(within(signIn).getByLabelText('Name (optional)')).toBeVisible()
    expect(within(signIn).getByText(/You'll continue to Google Drive to sign in/)).toBeVisible()
    await user.click(within(signIn).getByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('button', { name: 'Continue with Google Drive' }))
    await waitFor(() => {
      expect(goToExternalUrl).toHaveBeenCalledWith(
        expect.stringContaining('https://accounts.example.test/oauth/authorize?state='),
      )
    })
  })

  it('offers a token as well as Sign in for an app that takes both', async () => {
    const { user } = renderConnections()
    const dialog = await openAdd(user)
    await user.click(await within(dialog).findByRole('button', { name: 'Notion' }))
    const signIn = await screen.findByRole('dialog', { name: 'Connect Notion' })
    await user.click(within(signIn).getByRole('radio', { name: 'Token' }))
    expect(await within(signIn).findByLabelText('Token')).toBeVisible()
    expect(within(signIn).getByText("You won't be able to see this again.")).toBeVisible()
  })

  it('asks WhatsApp for the phone number ID and the business account ID', async () => {
    const { user } = renderConnections()
    const dialog = await openAdd(user)
    await user.click(await within(dialog).findByRole('button', { name: 'WhatsApp' }))
    const signIn = await screen.findByRole('dialog', { name: 'Connect WhatsApp' })
    expect(within(signIn).getByLabelText('Phone number ID')).toBeVisible()
    expect(within(signIn).getByLabelText('Business account ID (optional)')).toBeVisible()
    await user.type(within(signIn).getByLabelText('Name'), 'Support line')
    await user.type(within(signIn).getByLabelText('Token'), 'EAAG-token-1234')
    await user.click(within(signIn).getByRole('button', { name: 'Next' }))
    expect(await within(signIn).findByText('This field is required.')).toBeVisible()
    await user.type(within(signIn).getByLabelText('Phone number ID'), '1055')
    await user.click(within(signIn).getByRole('button', { name: 'Next' }))
    expect(await screen.findByRole('radiogroup', { name: 'Who can use it' })).toBeVisible()
  })

  it('disables Add connection while offline', async () => {
    const online = vi.spyOn(globalThis.navigator, 'onLine', 'get').mockReturnValue(false)
    try {
      renderConnections()
      expect(await screen.findByText(/You're offline/)).toBeVisible()
      expect(screen.getByRole('button', { name: 'Add connection' })).toBeDisabled()
      // reads stay visible
      expect(await screen.findByText('Google Drive')).toBeVisible()
    } finally {
      online.mockRestore()
    }
  })
})
