// SPDX-License-Identifier: AGPL-3.0-only
import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import ProvidersTab from './ProvidersTab'
import { membersDomain, resetMembersMock } from '../../../../mock/handlers/members'
import { resetTeamsMock, teamsDomain } from '../../../../mock/handlers/teams'
import { resetVaultMock, vaultDomain } from '../../../../mock/handlers/vault'

vi.mock('next/navigation', () => ({ useParams: () => ({ orgSlug: 'acme' }) }))

const server = setupTestServer(
  ...vaultDomain.handlers,
  ...teamsDomain.handlers,
  ...membersDomain.handlers,
)

function renderProviders(searchParams?: string) {
  return renderWithProviders(<ProvidersTab />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs('admin')),
    searchParams,
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
  resetTeamsMock()
  resetMembersMock()
})

async function openRowMenu(user: ReturnType<typeof renderProviders>['user'], name: string) {
  await user.click(await screen.findByRole('button', { name: `Actions for ${name}` }))
}

/** Fills the Add API key dialog up to a passing connection test. */
async function fillAndTest(
  user: ReturnType<typeof renderProviders>['user'],
  dialog: HTMLElement,
  { name, secret }: { name?: string; secret: string },
) {
  if (name) {
    await user.clear(within(dialog).getByLabelText('Name'))
    await user.type(within(dialog).getByLabelText('Name'), name)
  }
  await user.type(within(dialog).getByLabelText('API key'), secret)
  await user.click(within(dialog).getByRole('button', { name: 'Test connection' }))
}

describe('ProvidersTab', () => {
  it('lists providers and keys with masked values, scope and spend', async () => {
    renderProviders()
    const table = await screen.findByRole('table', { name: 'API keys' })
    const openai = (await within(table).findByText('OpenAI production')).closest('tr')
    expect(openai).toHaveTextContent('••••a1B2')
    expect(openai).toHaveTextContent('Organization')
    expect(openai).toHaveTextContent('$42.30')
    const anthropic = within(table).getByText('Anthropic for Support').closest('tr')
    expect(anthropic).toHaveTextContent('Support')
    expect(within(table).getByText("Omar's OpenAI key").closest('tr')).toHaveTextContent(
      'Just Omar',
    )
    expect(await screen.findByRole('list', { name: 'Providers' })).toHaveTextContent('Google')
  })

  it('shows the reason, the expiry and "Fallback in use" when providers degrade', async () => {
    useScenario('degraded')
    renderProviders()
    const cards = await screen.findByRole('list', { name: 'Providers' })
    expect(await within(cards).findByText('Rate limited')).toBeVisible()
    expect(within(cards).getByText(/rejected this API key/)).toBeVisible()
    expect(within(cards).getByText('Fallback in use')).toBeVisible()
    expect(within(cards).getByText('Key expires in 5 days')).toBeVisible()
    const table = await screen.findByRole('table', { name: 'API keys' })
    expect(within(table).getByText('Expires in 5 days')).toBeVisible()
    expect(within(table).getByText('Expired')).toBeVisible()
  })

  it('keeps Save off until the connection test passes, then adds the key', async () => {
    const { user } = renderProviders()
    await user.click(await screen.findByRole('button', { name: 'Add API key' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add API key' })
    expect(within(dialog).getByRole('button', { name: 'Save key' })).toBeDisabled()
    await fillAndTest(user, dialog, { name: 'Staging', secret: 'test-staging-key' })
    expect(await within(dialog).findByText(/Connection works · 420 ms/)).toBeVisible()
    expect(within(dialog).getByText(/3 models available/)).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Save key' }))
    expect(await screen.findByText('Staging was added')).toBeVisible()
    const table = await screen.findByRole('table', { name: 'API keys' })
    expect(await within(table).findByText('Staging')).toBeVisible()
    expect(within(table).getByText('Staging').closest('tr')).toHaveTextContent('••••-key')
  })

  it('turns Save off again when the key changes after a passing test', async () => {
    const { user } = renderProviders()
    await user.click(await screen.findByRole('button', { name: 'Add API key' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add API key' })
    await fillAndTest(user, dialog, { name: 'Staging', secret: 'test-one' })
    await within(dialog).findByText(/Connection works/)
    expect(within(dialog).getByRole('button', { name: 'Save key' })).toBeEnabled()
    await user.type(within(dialog).getByLabelText('API key'), 'x')
    expect(within(dialog).queryByText(/Connection works/)).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Save key' })).toBeDisabled()
  })

  it("shows the provider's reason and keeps Save off when the test fails", async () => {
    useScenario('key-invalid')
    const { user } = renderProviders()
    await user.click(await screen.findByRole('button', { name: 'Add API key' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add API key' })
    await fillAndTest(user, dialog, { name: 'Bad', secret: 'test-bad' })
    expect(await within(dialog).findByText('The connection test failed')).toBeVisible()
    expect(within(dialog).getByText(/rejected this API key/)).toBeVisible()
    expect(within(dialog).getByRole('button', { name: 'Save key' })).toBeDisabled()
  })

  it('needs a team for a team key', async () => {
    const { user } = renderProviders()
    await user.click(await screen.findByRole('button', { name: 'Add API key' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add API key' })
    await fillAndTest(user, dialog, { name: 'Sales key', secret: 'test-sales' })
    await within(dialog).findByText(/Connection works/)
    await user.click(within(dialog).getByRole('radio', { name: 'One team' }))
    expect(within(dialog).getByRole('button', { name: 'Save key' })).toBeDisabled()
    await user.click(await within(dialog).findByRole('combobox', { name: 'Team' }))
    await user.click(await screen.findByRole('option', { name: 'Sales' }))
    expect(within(dialog).getByRole('button', { name: 'Save key' })).toBeEnabled()
  })

  it('rotates a key: add the replacement, switch traffic, then revoke the old key', async () => {
    const { user } = renderProviders()
    await openRowMenu(user, 'OpenAI production')
    await user.click(await screen.findByRole('menuitem', { name: 'Rotate' }))
    const dialog = await screen.findByRole('dialog', { name: 'Rotate OpenAI production' })
    expect(within(dialog).getByLabelText('Name')).toHaveValue('OpenAI production (new)')
    await fillAndTest(user, dialog, { secret: 'test-replacement-key' })
    await within(dialog).findByText(/Connection works/)
    await user.click(within(dialog).getByRole('button', { name: 'Save replacement' }))
    expect(await screen.findByText(/OpenAI production \(new\) was added/)).toBeVisible()

    const table = await screen.findByRole('table', { name: 'API keys' })
    expect(await within(table).findByText('Replaced by OpenAI production (new)')).toBeVisible()
    expect(within(table).getByText('Replacement · not in use yet')).toBeVisible()

    await openRowMenu(user, 'OpenAI production (new)')
    await user.click(await screen.findByRole('menuitem', { name: 'Switch traffic' }))
    const confirm = await screen.findByRole('alertdialog', {
      name: 'Switch traffic to OpenAI production (new)?',
    })
    expect(await within(confirm).findByText('3 agents')).toBeVisible()
    await user.click(within(confirm).getByRole('button', { name: 'Switch traffic' }))
    expect(await screen.findByText('Traffic now uses OpenAI production (new)')).toBeVisible()
  })

  it('revokes a key after listing what depends on it and where it falls back', async () => {
    const { user } = renderProviders()
    await openRowMenu(user, 'OpenAI production')
    await user.click(await screen.findByRole('menuitem', { name: 'Revoke' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Revoke OpenAI production?' })
    expect(await within(confirm).findByText('3 agents')).toBeVisible()
    expect(within(confirm).getByText('1 flow')).toBeVisible()
    expect(within(confirm).getByText('4 people used it this month')).toBeVisible()
    expect(within(confirm).getByText('They will fall back to Llama 3.1 70B')).toBeVisible()
    await user.click(within(confirm).getByRole('button', { name: 'Revoke key' }))
    expect(await screen.findByText('OpenAI production was revoked')).toBeVisible()
    const table = await screen.findByRole('table', { name: 'API keys' })
    await vi.waitFor(() => {
      expect(within(table).queryByText('OpenAI production')).not.toBeInTheDocument()
    })
  })

  it('tests a saved key from its menu', async () => {
    const { user } = renderProviders()
    await openRowMenu(user, 'OpenAI production')
    await user.click(await screen.findByRole('menuitem', { name: 'Test connection' }))
    expect(await screen.findByText('OpenAI production works · 3 models available')).toBeVisible()
  })

  it('invites you to connect a model when nothing is set up', async () => {
    useScenario('empty')
    renderProviders()
    expect(await screen.findByText('Connect an AI model to get started')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Add API key' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Add local server' })).toHaveAttribute(
      'href',
      '/acme/settings/vault/local-models?add=server',
    )
  })

  it('opens Add API key from ?add=key', async () => {
    renderProviders('?add=key')
    expect(await screen.findByRole('dialog', { name: 'Add API key' })).toBeVisible()
  })
})
