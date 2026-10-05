// SPDX-License-Identifier: AGPL-3.0-only
import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import PersonalKeys from './PersonalKeys'
import { resetVaultMock, vaultDomain } from '../../../../mock/handlers/vault'

vi.mock('next/navigation', () => ({ useParams: () => ({ orgSlug: 'acme' }) }))

const server = setupTestServer(...vaultDomain.handlers)

function renderPersonalKeys() {
  return renderWithProviders(<PersonalKeys />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs('user')),
  })
}

afterEach(() => {
  server.events.removeAllListeners()
})

beforeEach(() => {
  resetVaultMock()
})

describe('PersonalKeys', () => {
  it("lists only the person's own keys", async () => {
    renderPersonalKeys()
    const table = await screen.findByRole('table', { name: 'API keys' })
    const row = (await within(table).findByText('My OpenAI key')).closest('tr')
    expect(row).toHaveTextContent('••••m4Yz')
    expect(within(table).queryByText("Omar's OpenAI key")).not.toBeInTheDocument()
  })

  it('adds a personal key with the scope fixed to "Just me"', async () => {
    const { user } = renderPersonalKeys()
    await user.click(await screen.findByRole('button', { name: 'Add API key' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add API key' })
    expect(within(dialog).getByText('Just me. Only you can use this key.')).toBeVisible()
    expect(within(dialog).queryByRole('radio', { name: 'One team' })).not.toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('Name'), 'Side project')
    await user.type(within(dialog).getByLabelText('API key'), 'test-mine-5Tt1')
    await user.click(within(dialog).getByRole('button', { name: 'Test connection' }))
    await within(dialog).findByText(/Connection works/)
    await user.click(within(dialog).getByRole('button', { name: 'Save key' }))
    expect(await screen.findByText('Side project was added')).toBeVisible()
    const table = await screen.findByRole('table', { name: 'API keys' })
    expect(await within(table).findByText('Side project')).toBeVisible()
  })

  it('revokes a personal key', async () => {
    const { user } = renderPersonalKeys()
    await user.click(await screen.findByRole('button', { name: 'Actions for My OpenAI key' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Revoke' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Revoke My OpenAI key?' })
    await within(confirm).findByText('3 agents')
    await user.click(within(confirm).getByRole('button', { name: 'Revoke key' }))
    expect(await screen.findByText('My OpenAI key was revoked')).toBeVisible()
  })

  it('hides itself when the organization does not allow personal keys', async () => {
    server.events.on('request:start', ({ request }) => {
      request.headers.set('x-mock-scenario', 'personal-disabled')
    })
    renderPersonalKeys()
    await vi.waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Add API key' })).not.toBeInTheDocument()
      expect(screen.queryByText('API keys')).not.toBeInTheDocument()
    })
  })
})
