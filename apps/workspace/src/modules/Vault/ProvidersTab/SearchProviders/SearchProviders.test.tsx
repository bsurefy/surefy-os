// SPDX-License-Identifier: AGPL-3.0-only
import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import SearchProviders from './SearchProviders'
import { resetVaultMock, vaultDomain } from '../../../../../mock/handlers/vault'

vi.mock('next/navigation', () => ({ useParams: () => ({ orgSlug: 'acme' }) }))

const server = setupTestServer(...vaultDomain.handlers)

function renderSearchProviders() {
  return renderWithProviders(<SearchProviders />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs('admin')),
  })
}

/** Forces a scenario on every mocked request of this test. */
function useScenario(scenario: string) {
  server.events.on('request:start', ({ request }) => {
    request.headers.set('x-mock-scenario', scenario)
  })
}

afterEach(() => {
  server.events.removeAllListeners()
})

beforeEach(() => {
  resetVaultMock()
})

async function openRowMenu(user: ReturnType<typeof renderSearchProviders>['user'], name: string) {
  await user.click(await screen.findByRole('button', { name: `Actions for ${name}` }))
}

describe('SearchProviders', () => {
  it('lists the search providers and says which one web search uses', async () => {
    renderSearchProviders()
    const table = await screen.findByRole('table', { name: 'Search providers' })
    const brave = (await within(table).findByText('Brave production')).closest('tr')
    expect(brave).toHaveTextContent('Primary')
    expect(brave).toHaveTextContent('Brave')
    expect(brave).toHaveTextContent('••••Br4v')
    expect(await screen.findByText('Web search uses Brave production.')).toBeVisible()
  })

  it('warns that web search is not set up when no provider is primary', async () => {
    useScenario('none')
    renderSearchProviders()
    expect(await screen.findByText("Web search isn't set up")).toBeVisible()
    expect(await screen.findByText('No search providers yet')).toBeVisible()
  })

  it("says when the install's SearXNG address is the one in use", async () => {
    useScenario('install-searxng')
    renderSearchProviders()
    expect(await screen.findByText(/SearXNG address set for this install/)).toBeVisible()
  })

  it('shows the reason and the expiry when providers degrade', async () => {
    useScenario('degraded')
    renderSearchProviders()
    const table = await screen.findByRole('table', { name: 'Search providers' })
    expect(await within(table).findByText('Error')).toBeVisible()
    expect(within(table).getByText(/rejected this API key/)).toBeVisible()
    expect(within(table).getByText('Expires in 5 days')).toBeVisible()
  })

  it('keeps Save off until the connection test passes, then adds a Tavily key', async () => {
    const { user } = renderSearchProviders()
    await user.click(await screen.findByRole('button', { name: 'Add search provider' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add search provider' })
    expect(within(dialog).getByRole('button', { name: 'Save provider' })).toBeDisabled()
    await user.click(within(dialog).getByRole('combobox', { name: 'Provider' }))
    await user.click(await screen.findByRole('option', { name: 'Tavily' }))
    await user.type(within(dialog).getByLabelText('Name'), 'Tavily backup')
    await user.type(within(dialog).getByLabelText('API key'), 'tvly-test-key')
    await user.click(within(dialog).getByRole('button', { name: 'Test connection' }))
    expect(await within(dialog).findByText(/Connection works · 310 ms/)).toBeVisible()
    expect(within(dialog).getByText('No models were listed.')).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Save provider' }))
    expect(await screen.findByText('Tavily backup was added')).toBeVisible()
    const table = await screen.findByRole('table', { name: 'Search providers' })
    const added = (await within(table).findByText('Tavily backup')).closest('tr')
    expect(added).toHaveTextContent('••••-key')
    expect(added).not.toHaveTextContent('Primary')
  })

  it('adds a SearXNG instance by its address', async () => {
    useScenario('none')
    const { user } = renderSearchProviders()
    await user.click(await screen.findByRole('button', { name: 'Add search provider' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add search provider' })
    await user.click(within(dialog).getByRole('combobox', { name: 'Provider' }))
    await user.click(await screen.findByRole('option', { name: 'SearXNG' }))
    expect(within(dialog).queryByLabelText('API key')).not.toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('Name'), 'Office SearXNG')
    await user.click(within(dialog).getByRole('button', { name: 'Test connection' }))
    expect(
      await within(dialog).findByText('Enter the address of your SearXNG instance'),
    ).toBeVisible()
    await user.type(
      within(dialog).getByLabelText('SearXNG address'),
      'https://searxng.internal:8080',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Test connection' }))
    await within(dialog).findByText(/Connection works/)
    await user.click(within(dialog).getByRole('button', { name: 'Save provider' }))
    expect(await screen.findByText('Office SearXNG was added')).toBeVisible()
  })

  it('turns Save off again when the key changes after a passing test', async () => {
    const { user } = renderSearchProviders()
    await user.click(await screen.findByRole('button', { name: 'Add search provider' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add search provider' })
    await user.type(within(dialog).getByLabelText('Name'), 'Brave staging')
    await user.type(within(dialog).getByLabelText('API key'), 'BSA-one')
    await user.click(within(dialog).getByRole('button', { name: 'Test connection' }))
    await within(dialog).findByText(/Connection works/)
    expect(within(dialog).getByRole('button', { name: 'Save provider' })).toBeEnabled()
    await user.type(within(dialog).getByLabelText('API key'), 'x')
    expect(within(dialog).queryByText(/Connection works/)).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Save provider' })).toBeDisabled()
  })

  it("shows the provider's reason and keeps Save off when the test fails", async () => {
    useScenario('key-invalid')
    const { user } = renderSearchProviders()
    await user.click(await screen.findByRole('button', { name: 'Add search provider' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add search provider' })
    await user.type(within(dialog).getByLabelText('Name'), 'Bad')
    await user.type(within(dialog).getByLabelText('API key'), 'BSA-bad')
    await user.click(within(dialog).getByRole('button', { name: 'Test connection' }))
    expect(await within(dialog).findByText('The connection test failed')).toBeVisible()
    expect(within(dialog).getByRole('button', { name: 'Save provider' })).toBeDisabled()
  })

  it('makes another provider primary after asking', async () => {
    const { user } = renderSearchProviders()
    await user.click(await screen.findByRole('button', { name: 'Add search provider' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add search provider' })
    await user.type(within(dialog).getByLabelText('Name'), 'Brave staging')
    await user.type(within(dialog).getByLabelText('API key'), 'BSA-two')
    await user.click(within(dialog).getByRole('button', { name: 'Test connection' }))
    await within(dialog).findByText(/Connection works/)
    await user.click(within(dialog).getByRole('button', { name: 'Save provider' }))
    await screen.findByText('Brave staging was added')

    await openRowMenu(user, 'Brave staging')
    await user.click(await screen.findByRole('menuitem', { name: 'Make primary' }))
    const confirm = await screen.findByRole('alertdialog', {
      name: 'Use Brave staging for web search?',
    })
    await user.click(within(confirm).getByRole('button', { name: 'Make primary' }))
    expect(await screen.findByText('Web search now uses Brave staging')).toBeVisible()
    expect(await screen.findByText('Web search uses Brave staging.')).toBeVisible()
  })

  it('revokes the primary provider after listing what depends on it', async () => {
    const { user } = renderSearchProviders()
    await openRowMenu(user, 'Brave production')
    await user.click(await screen.findByRole('menuitem', { name: 'Revoke' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Revoke Brave production?' })
    expect(await within(confirm).findByText('3 agents')).toBeVisible()
    expect(within(confirm).getByText(/Web search stops working/)).toBeVisible()
    expect(within(confirm).queryByText(/fall back to/)).not.toBeInTheDocument()
    await user.click(within(confirm).getByRole('button', { name: 'Revoke provider' }))
    expect(await screen.findByText('Brave production was revoked')).toBeVisible()
    expect(await screen.findByText("Web search isn't set up")).toBeVisible()
  })

  it('tests a saved provider from its menu', async () => {
    const { user } = renderSearchProviders()
    await openRowMenu(user, 'Brave production')
    await user.click(await screen.findByRole('menuitem', { name: 'Test connection' }))
    expect(await screen.findByText('Brave production works')).toBeVisible()
  })
})
