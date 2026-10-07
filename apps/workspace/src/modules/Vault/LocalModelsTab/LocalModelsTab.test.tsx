// SPDX-License-Identifier: AGPL-3.0-only
import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import LocalModelsTab from './LocalModelsTab'
import { membersDomain, resetMembersMock } from '../../../../mock/handlers/members'
import { modelsDomain, resetModelsMock } from '../../../../mock/handlers/models'
import { resetTeamsMock, teamsDomain } from '../../../../mock/handlers/teams'
import { resetVaultMock, vaultDomain } from '../../../../mock/handlers/vault'

vi.mock('next/navigation', () => ({ useParams: () => ({ orgSlug: 'acme' }) }))

const server = setupTestServer(
  ...vaultDomain.handlers,
  ...modelsDomain.handlers,
  ...teamsDomain.handlers,
  ...membersDomain.handlers,
)

function renderLocalModels(searchParams?: string) {
  return renderWithProviders(<LocalModelsTab />, {
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
  resetModelsMock()
  resetTeamsMock()
  resetMembersMock()
})

describe('LocalModelsTab', () => {
  it('lists the servers with their address and the models they serve', async () => {
    renderLocalModels()
    const servers = await screen.findByRole('table', { name: 'Local servers' })
    const row = (await within(servers).findByText('GPU box')).closest('tr')
    expect(row).toHaveTextContent('https://gpu.internal:11434')
    expect(row).toHaveTextContent('Ollama')
    expect(row).toHaveTextContent('Online')
    const models = await screen.findByRole('table', { name: 'Local models' })
    expect(await within(models).findByText('llama3.1:70b')).toBeVisible()
    expect(within(models).getByRole('switch', { name: 'Enable llama3.1:70b' })).toBeChecked()
    expect(
      within(models).getByRole('switch', { name: 'Enable nomic-embed-text' }),
    ).not.toBeChecked()
  })

  it('enables a detected model at once', async () => {
    const { user } = renderLocalModels()
    await user.click(await screen.findByRole('switch', { name: 'Enable nomic-embed-text' }))
    expect(await screen.findByText('nomic-embed-text was enabled')).toBeVisible()
    expect(await screen.findByRole('switch', { name: 'Enable nomic-embed-text' })).toBeChecked()
  })

  it('asks before disabling a model that agents and flows use', async () => {
    const { user } = renderLocalModels()
    await user.click(await screen.findByRole('switch', { name: 'Enable llama3.1:70b' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Disable llama3.1:70b?' })
    expect(await within(confirm).findByText('2 agents')).toBeVisible()
    expect(within(confirm).getByText('1 knowledge base')).toBeVisible()
    await user.click(within(confirm).getByRole('button', { name: 'Disable model' }))
    expect(await screen.findByText('llama3.1:70b was disabled')).toBeVisible()
  })

  it('adds a server after a passing connection test and lists what it found', async () => {
    const { user } = renderLocalModels()
    await user.click(await screen.findByRole('button', { name: 'Add local server' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add local server' })
    expect(within(dialog).getByRole('button', { name: 'Add server' })).toBeDisabled()
    await user.type(within(dialog).getByLabelText('Name'), 'Lab server')
    await user.type(within(dialog).getByLabelText('Base URL'), 'https://lab.internal:8000')
    await user.click(within(dialog).getByRole('button', { name: 'Test connection' }))
    expect(await within(dialog).findByText(/Connection works/)).toBeVisible()
    expect(within(dialog).getByText(/2 models available/)).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Add server' }))
    expect(await screen.findByText(/Lab server was added · 2 models found/)).toBeVisible()
    const servers = await screen.findByRole('table', { name: 'Local servers' })
    expect(await within(servers).findByText('Lab server')).toBeVisible()
  })

  it('shows the address that was checked when the server is offline', async () => {
    useScenario('server-offline')
    const { user } = renderLocalModels()
    await user.click(await screen.findByRole('button', { name: 'Add local server' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add local server' })
    await user.type(within(dialog).getByLabelText('Name'), 'Down')
    await user.type(within(dialog).getByLabelText('Base URL'), 'https://down.internal:8000')
    await user.click(within(dialog).getByRole('button', { name: 'Test connection' }))
    expect(await within(dialog).findByText('The connection test failed')).toBeVisible()
    expect(within(dialog).getByText('Address checked: https://down.internal:8000')).toBeVisible()
    expect(within(dialog).getByText(/Nothing answered at this address/)).toBeVisible()
    expect(within(dialog).getByRole('button', { name: 'Add server' })).toBeDisabled()
  })

  it('removes a server after listing what depends on it', async () => {
    const { user } = renderLocalModels()
    await user.click(await screen.findByRole('button', { name: 'Actions for GPU box' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Remove server' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Remove GPU box?' })
    expect(await within(confirm).findByText('3 agents')).toBeVisible()
    await user.click(within(confirm).getByRole('button', { name: 'Remove server' }))
    expect(await screen.findByText('GPU box was removed')).toBeVisible()
  })

  it('says why a server in use cannot be removed', async () => {
    useScenario('server-in-use')
    const { user } = renderLocalModels()
    await user.click(await screen.findByRole('button', { name: 'Actions for GPU box' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Remove server' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Remove GPU box?' })
    await within(confirm).findByText('3 agents')
    await user.click(within(confirm).getByRole('button', { name: 'Remove server' }))
    expect(await within(confirm).findByText(/still in use/)).toBeVisible()
  })

  it('syncs the models of a server', async () => {
    const { user } = renderLocalModels()
    await user.click(await screen.findByRole('button', { name: 'Actions for GPU box' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Sync models' }))
    expect(await screen.findByText('GPU box synced · 1 added, 0 removed')).toBeVisible()
  })

  it('invites you to connect a server when there is none', async () => {
    useScenario('empty')
    renderLocalModels()
    expect(await screen.findByText('Connect a model on your own server')).toBeVisible()
  })

  it('opens Add local server from ?add=server', async () => {
    renderLocalModels('?add=server')
    expect(await screen.findByRole('dialog', { name: 'Add local server' })).toBeVisible()
  })
})
