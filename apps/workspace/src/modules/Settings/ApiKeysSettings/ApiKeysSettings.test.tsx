// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { accessKeys } from '@surefy/web-core/api/access'
import { meKeys } from '@surefy/web-core/api/me'
import {
  createTestQueryClient,
  renderWithProviders,
  setupTestServer,
} from '@surefy/web-core/testing'

import ApiKeysSettings from './ApiKeysSettings'
import {
  apiKeysDomain,
  EXPIRED_KEY_ID,
  resetApiKeysMock,
  WEBSITE_KEY_ID,
} from '../../../../mock/handlers/apiKeys'
import { shellMe } from '../../../../mock/handlers/shell.fixtures'

vi.mock('next/navigation', () => ({ useParams: () => ({ orgSlug: 'acme' }) }))

const server = setupTestServer(...apiKeysDomain.handlers)

function renderKeys(role: 'owner' | 'admin' | 'builder' = 'admin', searchParams?: string) {
  return renderWithProviders(<ApiKeysSettings />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs(role)),
    searchParams,
  })
}

/** Forces a scenario on every mocked request of this test. */
function useScenario(scenario: string) {
  server.events.on('request:start', ({ request }) => {
    request.headers.set('x-mock-scenario', scenario)
  })
}

beforeEach(() => {
  resetApiKeysMock()
})

afterEach(() => {
  // a scenario forced by `useScenario` ends with its test
  server.events.removeAllListeners()
})

describe('ApiKeysSettings', () => {
  it('lists the active keys with the start of the key, permissions, creator and expiry', async () => {
    renderKeys()
    const table = await screen.findByRole('table', { name: 'API keys' })
    const website = (await within(table).findByText('Website backend')).closest('tr')
    expect(website).toHaveTextContent('sk_Ab3dEf01…')
    expect(website).toHaveTextContent('Run agents')
    expect(website).toHaveTextContent('Maya Okafor')
    expect(website).toHaveTextContent('Active')
    const zapier = within(table).getByText('Zapier').closest('tr')
    expect(zapier).toHaveTextContent('Omar Haddad')
    expect(zapier).toHaveTextContent('Never')
    // revoked keys stay hidden until that filter is chosen
    expect(within(table).queryByText('Retired job')).not.toBeInTheDocument()
  })

  it('tags an expired key and names a former member', async () => {
    renderKeys()
    const old = (await screen.findByText('Old script')).closest('tr')
    expect(old).toHaveTextContent('Expired')
    expect(old).toHaveTextContent('Former member')
  })

  it('shows revoked keys under the Revoked filter', async () => {
    renderKeys('admin', '?status=revoked')
    expect(await screen.findByText('Retired job')).toBeVisible()
    expect(screen.queryByText('Website backend')).not.toBeInTheDocument()
  })

  it('searches by name and offers to clear a search without results', async () => {
    renderKeys('admin', '?q=nothing')
    expect(await screen.findByText('No keys match')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeVisible()
  })

  it('invites the first key when there are none', async () => {
    useScenario('empty')
    renderKeys()
    expect(await screen.findByText('No API keys yet')).toBeVisible()
    expect(screen.getAllByRole('button', { name: 'Create key' }).length).toBeGreaterThan(0)
  })

  it('shows a retryable error when the keys cannot load', async () => {
    useScenario('error')
    renderKeys()
    expect(await screen.findByText("Couldn't load API keys")).toBeVisible()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible()
  })

  it('hides the create and row actions from people who cannot manage keys', async () => {
    renderKeys('builder')
    await screen.findByText('Website backend')
    expect(screen.queryByRole('button', { name: 'Create key' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Actions for/ })).not.toBeInTheDocument()
  })

  describe('creating a key', () => {
    async function fillAndSubmit(user: ReturnType<typeof renderKeys>['user']) {
      await user.click(await screen.findByRole('button', { name: 'Create key' }))
      const dialog = await screen.findByRole('dialog', { name: 'Create API key' })
      await user.type(within(dialog).getByLabelText('Name'), 'CI pipeline')
      await user.click(within(dialog).getByRole('checkbox', { name: /Run agents/ }))
      await user.click(within(dialog).getByRole('button', { name: 'Create key' }))
      return dialog
    }

    it('shows the new key once, with a call to paste, and lists it behind the dialog', async () => {
      const { user } = renderKeys()
      await fillAndSubmit(user)
      const created = await screen.findByRole('dialog', { name: 'Your new key' })
      expect(within(created).getByLabelText<HTMLInputElement>('API key').value).toMatch(
        /^sk_[0-9A-Za-z]{43}$/,
      )
      expect(within(created).getByText(/You won't be able to see this key again/)).toBeVisible()
      expect(within(created).getByText(/Authorization: Bearer sk_/)).toBeVisible()
      await user.click(within(created).getByRole('button', { name: 'Copy' }))
      expect(await within(created).findByRole('button', { name: 'Copied' })).toBeVisible()
      await user.click(within(created).getByRole('button', { name: 'Done' }))
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'Your new key' })).not.toBeInTheDocument()
      })
      expect(await screen.findByText('CI pipeline')).toBeVisible()
    })

    it('asks before closing a key that was not copied', async () => {
      const { user } = renderKeys()
      await fillAndSubmit(user)
      const created = await screen.findByRole('dialog', { name: 'Your new key' })
      await user.click(within(created).getByRole('button', { name: 'Done' }))
      expect(await within(created).findByText('Close without copying?')).toBeVisible()
      await user.click(within(created).getByRole('button', { name: 'Keep open' }))
      expect(within(created).queryByText('Close without copying?')).not.toBeInTheDocument()
      await user.click(within(created).getByRole('button', { name: 'Done' }))
      await user.click(within(created).getByRole('button', { name: 'Close anyway' }))
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'Your new key' })).not.toBeInTheDocument()
      })
    })

    it('needs a name and at least one permission', async () => {
      const { user } = renderKeys()
      await user.click(await screen.findByRole('button', { name: 'Create key' }))
      const dialog = await screen.findByRole('dialog', { name: 'Create API key' })
      await user.click(within(dialog).getByRole('button', { name: 'Create key' }))
      expect(await within(dialog).findByText('This field is required.')).toBeVisible()
      expect(within(dialog).getByText('Choose at least 1 item.')).toBeVisible()
      expect(screen.queryByRole('dialog', { name: 'Your new key' })).not.toBeInTheDocument()
    })

    it('keeps the form and asks to confirm identity when the session is not fresh', async () => {
      useScenario('session-not-fresh')
      const onSessionNotFresh = vi.fn()
      const queryClient = createTestQueryClient({ handlers: { onSessionNotFresh } })
      queryClient.setQueryData(meKeys.current(), shellMe())
      queryClient.setQueryData(accessKeys.me(ORG_ID), accessAs('admin'))
      const { user } = renderWithProviders(<ApiKeysSettings />, {
        orgId: ORG_ID,
        messages: appMessages,
        queryClient,
        handlers: { onSessionNotFresh },
      })
      const dialog = await fillAndSubmit(user)
      // nothing was created and no error is shown over the form: the confirmation dialog speaks
      await waitFor(() => {
        expect(within(dialog).getByRole('button', { name: 'Create key' })).toBeEnabled()
      })
      expect(within(dialog).getByLabelText('Name')).toHaveValue('CI pipeline')
      expect(screen.queryByRole('dialog', { name: 'Your new key' })).not.toBeInTheDocument()
      expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
      expect(onSessionNotFresh).toHaveBeenCalled()
    })

    it('puts a refused expiry on the date field', async () => {
      useScenario('expiry-invalid')
      const { user } = renderKeys()
      await fillAndSubmit(user)
      expect(await screen.findByText('Choose an expiry date in the future.')).toBeVisible()
    })
  })

  describe('a key', () => {
    it('opens its detail drawer from the URL with the agents that use it', async () => {
      renderKeys('admin', `?key=${WEBSITE_KEY_ID}`)
      const drawer = await screen.findByRole('dialog', { name: 'Website backend' })
      expect(within(drawer).getByText('Starts with sk_Ab3dEf01…')).toBeVisible()
      expect(within(drawer).getByText('Run agents')).toBeVisible()
      expect(within(drawer).getByText('203.0.113.7', { exact: false })).toBeVisible()
      expect(await within(drawer).findByRole('link', { name: 'Support triage' })).toBeVisible()
      expect(within(drawer).getByRole('link', { name: 'HR helper' })).toBeVisible()
      expect(within(drawer).getByRole('link', { name: 'View audit log' })).toHaveAttribute(
        'href',
        '/acme/guard/audit-log?object=api_key',
      )
    })

    it('suggests a replacement for an expired key', async () => {
      renderKeys('admin', `?key=${EXPIRED_KEY_ID}`)
      const drawer = await screen.findByRole('dialog', { name: 'Old script' })
      expect(within(drawer).getByText('This key has expired')).toBeVisible()
      expect(within(drawer).getByRole('button', { name: 'Create replacement' })).toBeVisible()
    })

    it('renames from the row menu', async () => {
      const { user } = renderKeys()
      await user.click(await screen.findByRole('button', { name: 'Actions for Zapier' }))
      await user.click(await screen.findByRole('menuitem', { name: 'Rename' }))
      const dialog = await screen.findByRole('dialog', { name: 'Rename key' })
      await user.clear(within(dialog).getByLabelText('Name'))
      await user.type(within(dialog).getByLabelText('Name'), 'Zapier production')
      await user.click(within(dialog).getByRole('button', { name: 'Save' }))
      expect(await screen.findByText('Renamed to Zapier production')).toBeVisible()
      expect(await screen.findByRole('button', { name: 'Zapier production' })).toBeVisible()
    })

    it('names what stops working before revoking, then revokes', async () => {
      const { user } = renderKeys()
      await user.click(await screen.findByRole('button', { name: 'Actions for Website backend' }))
      await user.click(await screen.findByRole('menuitem', { name: 'Revoke…' }))
      const confirm = await screen.findByRole('alertdialog', { name: 'Revoke Website backend?' })
      expect(
        await within(confirm).findByText(
          '2 agents published over the API stop answering calls with this key: Support triage, HR helper',
        ),
      ).toBeVisible()
      expect(within(confirm).getByText(/Calls with this key fail at once/)).toBeVisible()
      // other keys exist, so rotating is suggested
      expect(within(confirm).getByText(/create the new key and deploy it first/)).toBeVisible()
      await user.click(within(confirm).getByRole('button', { name: 'Revoke key' }))
      expect(await screen.findByText('Website backend was revoked')).toBeVisible()
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'Website backend' })).not.toBeInTheDocument()
      })
    })

    it('says an unused key can be revoked without effect', async () => {
      const { user } = renderKeys()
      await user.click(await screen.findByRole('button', { name: 'Actions for Zapier' }))
      await user.click(await screen.findByRole('menuitem', { name: 'Revoke…' }))
      const confirm = await screen.findByRole('alertdialog', { name: 'Revoke Zapier?' })
      expect(await within(confirm).findByText(/Nothing uses this key/)).toBeVisible()
    })
  })
})
