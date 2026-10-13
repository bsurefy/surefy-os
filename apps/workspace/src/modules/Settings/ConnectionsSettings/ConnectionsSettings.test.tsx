// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import ConnectionsSettings from './ConnectionsSettings'
import { goToExternalUrl } from './ConnectionsSettings.navigation'
import {
  BILLING_ID,
  connectionsDomain,
  GOOGLE_DRIVE_ID,
  resetConnectionsMock,
  SLACK_ID,
} from '../../../../mock/handlers/connections'
import { resetTeamsMock, teamsDomain } from '../../../../mock/handlers/teams'

vi.mock('next/navigation', () => ({ useParams: () => ({ orgSlug: 'acme' }) }))
vi.mock('./ConnectionsSettings.navigation', () => ({ goToExternalUrl: vi.fn() }))

const server = setupTestServer(...connectionsDomain.handlers, ...teamsDomain.handlers)

function renderConnections(role: 'owner' | 'admin' | 'builder' = 'admin', searchParams?: string) {
  return renderWithProviders(<ConnectionsSettings />, {
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

/** Forces a scenario on the requests whose URL contains `part`. */
function useScenarioFor(part: string, scenario: string) {
  server.events.on('request:start', ({ request }) => {
    if (request.url.includes(part)) request.headers.set('x-mock-scenario', scenario)
  })
}

async function rowOf(name: string) {
  const row = (await screen.findByText(name)).closest('tr')
  if (!row) throw new Error(`No row for ${name}`)
  return row
}

beforeEach(() => {
  resetConnectionsMock()
  resetTeamsMock()
  vi.mocked(goToExternalUrl).mockClear()
})

afterEach(() => {
  // a scenario forced by `useScenario` ends with its test
  server.events.removeAllListeners()
})

describe('ConnectionsSettings', () => {
  describe('the list', () => {
    it('shows the account, what it is used for, who can use it, who connected it and its status', async () => {
      renderConnections()
      const table = await screen.findByRole('table', { name: 'Connections' })
      const drive = (await within(table).findByText('Google Drive')).closest('tr')
      expect(drive).toHaveTextContent('maya@acme.test')
      expect(drive).toHaveTextContent('Knowledge source')
      expect(drive).toHaveTextContent('Organization')
      expect(drive).toHaveTextContent('Maya Okafor')
      expect(drive).toHaveTextContent('3 uses')
      expect(drive).toHaveTextContent('Active')

      // a key shows only the masked end; an Admin sees whose personal connection it is
      const notion = await rowOf("Omar's Notion")
      expect(notion).toHaveTextContent('…a4f2')
      expect(notion).toHaveTextContent('Just me (Omar Haddad)')

      const billing = await rowOf('Billing API')
      expect(billing).toHaveTextContent('Support')
      expect(billing).toHaveTextContent('…c9d1')

      expect(await rowOf('Docs MCP')).toHaveTextContent('Never')
    })

    it('hides disconnected connections until that filter is chosen', async () => {
      renderConnections()
      await screen.findByText('Acme Slack')
      expect(screen.queryByText('WhatsApp support')).not.toBeInTheDocument()
    })

    it('shows disconnected connections under the Disconnected filter', async () => {
      renderConnections('admin', '?status=disconnected')
      expect(await screen.findByText('WhatsApp support')).toBeVisible()
      expect(screen.queryByText('Acme Slack')).not.toBeInTheDocument()
      // nothing can be done to a disconnected connection
      expect(screen.queryByRole('button', { name: /^Actions for/ })).not.toBeInTheDocument()
    })

    it('puts the connections that need attention first, with the reason and a Reconnect button', async () => {
      renderConnections()
      await screen.findByText('Acme Slack')
      const rows = within(screen.getByRole('table', { name: 'Connections' })).getAllByRole('row')
      expect(rows[1]).toHaveTextContent('Acme Slack')
      expect(rows[2]).toHaveTextContent('Billing API')
      const slack = await rowOf('Acme Slack')
      expect(slack).toHaveTextContent('Expired')
      expect(slack).toHaveTextContent('Sign-in expired')
      expect(within(slack).getByRole('button', { name: 'Reconnect' })).toBeVisible()
      expect(await rowOf('Billing API')).toHaveTextContent('The app rejects calls')
    })

    it('counts what needs attention in a banner that filters the list', async () => {
      const { user } = renderConnections()
      expect(await screen.findByText('2 connections need attention')).toBeVisible()
      await user.click(screen.getByRole('button', { name: 'Show' }))
      await waitFor(() => {
        expect(screen.queryByText('Google Drive')).not.toBeInTheDocument()
      })
      expect(screen.getByText('Acme Slack')).toBeVisible()
      expect(screen.getByText('Billing API')).toBeVisible()
      // already filtered: the banner stays but offers nothing more
      expect(screen.queryByRole('button', { name: 'Show' })).not.toBeInTheDocument()
    })

    it('filters by what a connection is used for', async () => {
      renderConnections('admin', '?kind=channel')
      expect(await screen.findByText('Acme Slack')).toBeVisible()
      expect(screen.queryByText('Billing API')).not.toBeInTheDocument()
    })

    it('searches by name and offers to clear a search without results', async () => {
      renderConnections('admin', '?q=nothing')
      expect(await screen.findByText('No connections match')).toBeVisible()
      expect(screen.getByRole('button', { name: 'Clear filters' })).toBeVisible()
    })

    it('invites the first connection when there are none', async () => {
      useScenario('empty')
      renderConnections()
      expect(
        await screen.findByText('Connect the apps your agents and knowledge need'),
      ).toBeVisible()
      expect(screen.getAllByRole('button', { name: 'Add connection' }).length).toBeGreaterThan(0)
    })

    it('shows a retryable error when the connections cannot load', async () => {
      useScenario('error')
      renderConnections()
      expect(await screen.findByText("Couldn't load connections")).toBeVisible()
      expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible()
    })
  })

  describe('a Builder', () => {
    it('sees their own connections without who connected them or who can use them', async () => {
      useScenarioFor('/connections', 'own-only')
      renderConnections('builder')
      expect(await screen.findByText('Google Drive')).toBeVisible()
      expect(screen.queryByText("Omar's Notion")).not.toBeInTheDocument()
      expect(screen.queryByRole('columnheader', { name: 'Connected by' })).not.toBeInTheDocument()
      expect(screen.queryByRole('columnheader', { name: 'Who can use it' })).not.toBeInTheDocument()
      expect(screen.queryByRole('combobox', { name: 'Who can use it' })).not.toBeInTheDocument()
    })

    it('may act on their own connections', async () => {
      useScenarioFor('/connections', 'own-only')
      renderConnections('builder')
      expect(await screen.findByRole('button', { name: 'Actions for Google Drive' })).toBeVisible()
    })
  })

  describe('testing a connection', () => {
    it('reports a working connection and clears its warning', async () => {
      const { user } = renderConnections()
      await user.click(await screen.findByRole('button', { name: 'Actions for Billing API' }))
      await user.click(await screen.findByRole('menuitem', { name: 'Test' }))
      expect(await screen.findByText('Billing API is working')).toBeVisible()
      await waitFor(() => {
        expect(screen.getByText('1 connection needs attention')).toBeVisible()
      })
    })

    it('reports the app’s reason when the check fails', async () => {
      useScenarioFor('/test', 'failed')
      const { user } = renderConnections()
      await user.click(await screen.findByRole('button', { name: 'Actions for Google Drive' }))
      await user.click(await screen.findByRole('menuitem', { name: 'Test' }))
      expect(
        await screen.findByText('Google Drive failed its check: The app rejects calls'),
      ).toBeVisible()
    })
  })

  describe('renaming', () => {
    it('renames from the row menu', async () => {
      const { user } = renderConnections()
      await user.click(await screen.findByRole('button', { name: 'Actions for Docs MCP' }))
      await user.click(await screen.findByRole('menuitem', { name: 'Rename or edit address' }))
      const dialog = await screen.findByRole('dialog', {
        name: 'Rename connection or edit its address',
      })
      await user.clear(within(dialog).getByLabelText('Name'))
      await user.type(within(dialog).getByLabelText('Name'), 'Docs server')
      await user.click(within(dialog).getByRole('button', { name: 'Save' }))
      expect(await screen.findByText('Saved Docs server')).toBeVisible()
      expect(await screen.findByText('Docs server')).toBeVisible()
    })

    it('offers no address for a connection without one', async () => {
      const { user } = renderConnections()
      await user.click(await screen.findByRole('button', { name: 'Actions for Google Drive' }))
      await user.click(await screen.findByRole('menuitem', { name: 'Rename' }))
      const dialog = await screen.findByRole('dialog', { name: 'Rename connection' })
      expect(within(dialog).queryByLabelText('Address')).not.toBeInTheDocument()
    })

    it('needs an https address when one is edited', async () => {
      const { user } = renderConnections()
      await user.click(await screen.findByRole('button', { name: 'Actions for Docs MCP' }))
      await user.click(await screen.findByRole('menuitem', { name: 'Rename or edit address' }))
      const dialog = await screen.findByRole('dialog', {
        name: 'Rename connection or edit its address',
      })
      await user.clear(within(dialog).getByLabelText('Address'))
      await user.type(within(dialog).getByLabelText('Address'), 'not a url')
      await user.click(within(dialog).getByRole('button', { name: 'Save' }))
      expect(await within(dialog).findByText(/valid URL/i)).toBeVisible()
    })
  })

  describe('what uses a connection', () => {
    it('lists the dependents by name', async () => {
      const { user } = renderConnections()
      const slack = await rowOf('Acme Slack')
      await user.click(within(slack).getByRole('button', { name: '4 uses' }))
      const dialog = await screen.findByRole('dialog', { name: 'What uses Acme Slack' })
      expect(await within(dialog).findByText('Support triage')).toBeVisible()
      expect(within(dialog).getByText('HR helper')).toBeVisible()
      expect(within(dialog).getByText("Support triage's Slack channel")).toBeVisible()
      // agents open their page; channels are listed by name
      expect(within(dialog).getByRole('link', { name: 'Support triage' })).toHaveAttribute(
        'href',
        expect.stringMatching(/^\/acme\/agents\//),
      )
      expect(
        within(dialog).queryByRole('link', { name: "Support triage's Slack channel" }),
      ).not.toBeInTheDocument()
    })
  })

  describe('disconnecting', () => {
    it('names what is affected before disconnecting, then disconnects', async () => {
      const { user } = renderConnections()
      await user.click(await screen.findByRole('button', { name: 'Actions for Acme Slack' }))
      await user.click(await screen.findByRole('menuitem', { name: 'Disconnect…' }))
      const confirm = await screen.findByRole('alertdialog', { name: 'Disconnect Acme Slack?' })
      expect(
        await within(confirm).findByText(
          '3 agents will lose a tool: Support triage, HR helper, Standup notes',
        ),
      ).toBeVisible()
      expect(
        within(confirm).getByText("1 channel will stop answering: Support triage's Slack channel"),
      ).toBeVisible()
      await user.click(within(confirm).getByRole('button', { name: 'Disconnect' }))
      expect(await screen.findByText('Disconnected Acme Slack')).toBeVisible()
      await waitFor(() => {
        expect(screen.queryByText('Acme Slack')).not.toBeInTheDocument()
      })
    })

    it('says "and N more" past the names the API lists', async () => {
      useScenarioFor('/impact', 'many')
      const { user } = renderConnections()
      await user.click(await screen.findByRole('button', { name: 'Actions for Billing API' }))
      await user.click(await screen.findByRole('menuitem', { name: 'Disconnect…' }))
      const confirm = await screen.findByRole('alertdialog', { name: 'Disconnect Billing API?' })
      expect(await within(confirm).findByText(/54 agents will lose a tool/)).toBeVisible()
      expect(within(confirm).getByText(/and 4 more/)).toBeVisible()
    })

    it('says an unused connection can be disconnected without effect', async () => {
      const { user } = renderConnections()
      await user.click(await screen.findByRole('button', { name: 'Actions for Docs MCP' }))
      await user.click(await screen.findByRole('menuitem', { name: 'Disconnect…' }))
      const confirm = await screen.findByRole('alertdialog', { name: 'Disconnect Docs MCP?' })
      expect(await within(confirm).findByText(/Nothing uses this connection/)).toBeVisible()
    })

    it('does not disconnect when the dependents cannot be loaded', async () => {
      useScenarioFor('/impact', 'error')
      const { user } = renderConnections()
      await user.click(await screen.findByRole('button', { name: 'Actions for Billing API' }))
      await user.click(await screen.findByRole('menuitem', { name: 'Disconnect…' }))
      const confirm = await screen.findByRole('alertdialog', { name: 'Disconnect Billing API?' })
      expect(await within(confirm).findByText(/Couldn't load what depends on this/)).toBeVisible()
      expect(within(confirm).getByRole('button', { name: 'Retry' })).toBeVisible()
      // without the dependents, confirming changes nothing
      await user.click(within(confirm).getByRole('button', { name: 'Disconnect' }))
      expect(screen.getByRole('alertdialog', { name: 'Disconnect Billing API?' })).toBeVisible()
      expect(screen.queryByText('Disconnected Billing API')).not.toBeInTheDocument()
    })
  })

  describe('reconnecting', () => {
    it('sends an OAuth connection through the app’s sign-in again', async () => {
      const { user } = renderConnections()
      const slack = await rowOf('Acme Slack')
      await user.click(within(slack).getByRole('button', { name: 'Reconnect' }))
      const dialog = await screen.findByRole('dialog', { name: 'Reconnect Acme Slack' })
      expect(within(dialog).getByText(/It must be the same account/)).toBeVisible()
      await user.click(within(dialog).getByRole('button', { name: 'Continue with Slack' }))
      await waitFor(() => {
        expect(goToExternalUrl).toHaveBeenCalledWith(
          expect.stringContaining('https://accounts.example.test/oauth/authorize?state='),
        )
      })
    })

    it('replaces a key and clears the warning', async () => {
      const { user } = renderConnections()
      const billing = await rowOf('Billing API')
      await user.click(within(billing).getByRole('button', { name: 'Reconnect' }))
      const dialog = await screen.findByRole('dialog', { name: 'Reconnect Billing API' })
      await user.type(within(dialog).getByLabelText('API key'), 'new-secret-key')
      await user.click(within(dialog).getByRole('button', { name: 'Reconnect' }))
      expect(await screen.findByText('Reconnected Billing API')).toBeVisible()
      await waitFor(() => {
        expect(screen.getByText('1 connection needs attention')).toBeVisible()
      })
    })

    it('shows why the app refused the new key', async () => {
      useScenarioFor('/reconnect', 'provider-rejected')
      const { user } = renderConnections()
      const billing = await rowOf('Billing API')
      await user.click(within(billing).getByRole('button', { name: 'Reconnect' }))
      const dialog = await screen.findByRole('dialog', { name: 'Reconnect Billing API' })
      await user.type(within(dialog).getByLabelText('API key'), 'wrong')
      await user.click(within(dialog).getByRole('button', { name: 'Reconnect' }))
      expect(await within(dialog).findByText(/The app rejected these credentials/)).toBeVisible()
    })

    it('needs the new key', async () => {
      const { user } = renderConnections()
      const billing = await rowOf('Billing API')
      await user.click(within(billing).getByRole('button', { name: 'Reconnect' }))
      const dialog = await screen.findByRole('dialog', { name: 'Reconnect Billing API' })
      await user.click(within(dialog).getByRole('button', { name: 'Reconnect' }))
      expect(await within(dialog).findByText('This field is required.')).toBeVisible()
    })

    it('has no Reconnect for a connection without a sign-in', async () => {
      const { user } = renderConnections()
      await user.click(await screen.findByRole('button', { name: 'Actions for Docs MCP' }))
      expect(screen.queryByRole('menuitem', { name: 'Reconnect' })).not.toBeInTheDocument()
      expect(await screen.findByRole('menuitem', { name: 'Test' })).toBeVisible()
    })
  })

  it('keeps the connection ids the other tests rely on', () => {
    expect([GOOGLE_DRIVE_ID, SLACK_ID, BILLING_ID]).toHaveLength(3)
  })
})
