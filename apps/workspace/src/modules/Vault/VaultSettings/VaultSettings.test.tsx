// SPDX-License-Identifier: AGPL-3.0-only
import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import VaultSettings from './VaultSettings'
import { membersDomain, resetMembersMock } from '../../../../mock/handlers/members'
import { modelsDomain, resetModelsMock } from '../../../../mock/handlers/models'
import { resetTeamsMock, teamsDomain } from '../../../../mock/handlers/teams'
import { resetVaultMock, vaultDomain } from '../../../../mock/handlers/vault'

const route = vi.hoisted(() => ({ orgSlug: 'acme', tab: undefined as string | undefined }))
vi.mock('next/navigation', () => ({ useParams: () => route }))

const server = setupTestServer(
  ...vaultDomain.handlers,
  ...modelsDomain.handlers,
  ...teamsDomain.handlers,
  ...membersDomain.handlers,
)

function renderVault(role: 'admin' | 'builder' | 'user' = 'admin') {
  return renderWithProviders(<VaultSettings />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs(role)),
  })
}

afterEach(() => {
  server.events.removeAllListeners()
})

beforeEach(() => {
  route.tab = undefined
  resetVaultMock()
  resetModelsMock()
  resetTeamsMock()
  resetMembersMock()
})

describe('VaultSettings', () => {
  it('opens on Providers & keys with one link per tab', async () => {
    renderVault()
    const tabs = await screen.findByRole('navigation', { name: 'Vault sections' })
    expect(within(tabs).getByRole('link', { name: 'Providers & keys' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(tabs).getByRole('link', { name: 'Fallback' })).toHaveAttribute(
      'href',
      '/acme/settings/vault/fallback',
    )
    expect(await screen.findByRole('table', { name: 'API keys' })).toBeVisible()
  })

  it.each([
    ['local-models', 'Local models', 'Local servers'],
    ['model-access', 'Model access', 'Model access'],
  ])('shows the %s tab from the route', async (tab, name, table) => {
    route.tab = tab
    renderVault()
    expect(await screen.findByRole('link', { name })).toHaveAttribute('aria-current', 'page')
    expect(await screen.findByRole('table', { name: table })).toBeVisible()
  })

  it('shows the fallback tab from the route', async () => {
    route.tab = 'fallback'
    renderVault()
    expect(await screen.findByText(/Requests go to/)).toBeVisible()
  })

  it('falls back to the first tab for an unknown tab', async () => {
    route.tab = 'routing'
    renderVault()
    expect(await screen.findByRole('link', { name: 'Providers & keys' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('gives Builders only the read-only list of the models they may use', async () => {
    renderVault('builder')
    const table = await screen.findByRole('table', { name: 'Models you can use' })
    const gpt = (await within(table).findByText('GPT-4.1')).closest('tr')
    expect(gpt).toHaveTextContent('Sent to OpenAI')
    expect(gpt).toHaveTextContent('Medium cost')
    const llama = within(table).getByText('llama3.1:70b').closest('tr')
    expect(llama).toHaveTextContent('Stays on your server')
    expect(llama).toHaveTextContent('No per-token cost')
    expect(screen.queryByRole('navigation', { name: 'Vault sections' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add API key' })).not.toBeInTheDocument()
  })

  it('tells a Builder when no model is enabled yet', async () => {
    server.events.on('request:start', ({ request }) => {
      request.headers.set('x-mock-scenario', 'empty')
    })
    renderVault('builder')
    expect(await screen.findByText('No models yet')).toBeVisible()
  })
})
