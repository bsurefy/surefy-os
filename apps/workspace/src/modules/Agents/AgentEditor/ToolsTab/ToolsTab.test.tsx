// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  agentEditorHandlers,
  leaveAgentEditor,
  readSavedAgent,
  renderAgentEditor,
  updateSavedDraft,
  useScenarioFor,
} from '@/test/agentEditor'
import type { AgentTool } from '@surefy/contracts'
import { fixtureUuid, setupTestServer } from '@surefy/web-core/testing'

import {
  DRAFT_AGENT_ID,
  READ_ONLY_AGENT_ID,
  resetAgentsMock,
} from '../../../../../mock/handlers/agents'
import {
  BILLING_ID,
  DOCS_MCP_ID,
  resetConnectionsMock,
} from '../../../../../mock/handlers/connections'
import { resetGuardMock } from '../../../../../mock/handlers/guard'
import { resetKnowledgeMock } from '../../../../../mock/handlers/knowledge'
import { resetMembersMock } from '../../../../../mock/handlers/members'
import { resetModelsMock } from '../../../../../mock/handlers/models'
import { resetTeamsMock } from '../../../../../mock/handlers/teams'
import { resetVaultMock } from '../../../../../mock/handlers/vault'

import type * as AgentEditorConstants from '../AgentEditor.constants'

let mockAgentId = DRAFT_AGENT_ID

vi.mock('next/navigation', () => ({
  useParams: () => ({ orgSlug: 'acme', agentId: mockAgentId, tab: 'tools' }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('../AgentEditor.constants', async (importOriginal) => ({
  ...(await importOriginal<typeof AgentEditorConstants>()),
  AUTOSAVE_DELAY_MS: 20,
}))

const server = setupTestServer(...agentEditorHandlers)

beforeEach(() => {
  mockAgentId = DRAFT_AGENT_ID
  localStorage.clear()
  resetAgentsMock()
  resetConnectionsMock()
  resetGuardMock()
  resetKnowledgeMock()
  resetMembersMock()
  resetModelsMock()
  resetTeamsMock()
  resetVaultMock()
})

afterEach(async () => {
  await leaveAgentEditor(server)
  server.events.removeAllListeners()
})

const ORDERS_ID = fixtureUuid(75, 1)
const WIKI_ID = fixtureUuid(75, 2)

const ordersTool: AgentTool = {
  id: ORDERS_ID,
  kind: 'api',
  name: 'Order lookup',
  description: 'Finds an order by its number',
  permission: 'read_only',
  enabled: true,
  method: 'GET',
  url: 'https://api.example.com/orders',
  headers: [],
  inputSchema: null,
  connectionId: BILLING_ID,
}

const wikiTool: AgentTool = {
  id: WIKI_ID,
  kind: 'mcp',
  name: 'Company wiki',
  description: '',
  permission: 'ask_first',
  enabled: true,
  serverUrl: 'https://mcp.example.com/sse',
  connectionId: DOCS_MCP_ID,
  discoveredActions: [
    { name: 'search_pages', description: 'Search the wiki', enabled: true, permission: null },
    { name: 'delete_page', description: 'Delete a page', enabled: true, permission: null },
  ],
}

const seedTools = (agentId: string, ...tools: AgentTool[]) =>
  updateSavedDraft(agentId, (definition) => ({ ...definition, tools }))

const savedTools = async (agentId = DRAFT_AGENT_ID) =>
  (await readSavedAgent(agentId)).draft.definition.tools

describe('ToolsTab', () => {
  it('invites a new agent to add its first tool', async () => {
    renderAgentEditor()
    expect(await screen.findByText('No tools yet')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Add tool' })).toBeEnabled()
  })

  it('lists the tools with their permission, switch and connection', async () => {
    await seedTools(DRAFT_AGENT_ID, ordersTool, wikiTool)
    renderAgentEditor()
    const orders = (await screen.findByText('Order lookup')).closest('li') as HTMLElement
    expect(within(orders).getByText(/GET api\.example\.com/)).toBeVisible()
    expect(
      within(orders).getByRole('combobox', { name: 'What Order lookup may do' }),
    ).toHaveTextContent('Read only')
    expect(within(orders).getByRole('switch', { name: 'Use Order lookup' })).toBeChecked()
    const wiki = screen.getByText('Company wiki').closest('li') as HTMLElement
    expect(within(wiki).getByText('2 of 2 actions on', { exact: false })).toBeVisible()
    expect(
      within(wiki).getByRole('combobox', { name: 'What Company wiki may do' }),
    ).toHaveTextContent('Ask first')
  })

  describe('adding an API tool', () => {
    it('saves the tool read only and on', async () => {
      const { user } = renderAgentEditor()
      await user.click(await screen.findByRole('button', { name: 'Add tool' }))
      await user.click(await screen.findByRole('menuitem', { name: 'API tool' }))
      const dialog = await screen.findByRole('dialog', { name: 'Add an API tool' })
      await user.type(within(dialog).getByLabelText('Name'), 'Order lookup')
      await user.type(within(dialog).getByLabelText('Address'), 'https://api.example.com/orders')
      await user.click(within(dialog).getByRole('button', { name: 'Add header' }))
      await user.type(within(dialog).getByLabelText('Header 1 name'), 'X-Region')
      await user.type(within(dialog).getByLabelText('Header 1 value'), 'eu')
      await user.click(within(dialog).getByRole('button', { name: 'Save tool' }))

      expect(await screen.findByText('Order lookup')).toBeVisible()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      await waitFor(async () => {
        expect(await savedTools()).toEqual([
          expect.objectContaining({
            kind: 'api',
            name: 'Order lookup',
            method: 'GET',
            url: 'https://api.example.com/orders',
            headers: [{ name: 'X-Region', value: 'eu' }],
            permission: 'read_only',
            enabled: true,
            connectionId: null,
            inputSchema: null,
          }),
        ])
      })
    })

    it('asks for a name and a web address before saving', async () => {
      const { user } = renderAgentEditor()
      await user.click(await screen.findByRole('button', { name: 'Add tool' }))
      await user.click(await screen.findByRole('menuitem', { name: 'API tool' }))
      const dialog = await screen.findByRole('dialog', { name: 'Add an API tool' })
      await user.type(within(dialog).getByLabelText('Address'), 'ftp://files.example.com')
      await user.click(within(dialog).getByRole('button', { name: 'Save tool' }))
      expect(await within(dialog).findByText('Give the tool a name.')).toBeVisible()
      expect(within(dialog).getByText(/Enter an address that starts with https/)).toBeVisible()
      expect(screen.getByRole('dialog', { name: 'Add an API tool' })).toBeVisible()
      expect(await savedTools()).toEqual([])
    })

    it('refuses a name another tool already has, and arguments that are not JSON', async () => {
      await seedTools(DRAFT_AGENT_ID, ordersTool)
      const { user } = renderAgentEditor()
      await screen.findByText('Order lookup')
      await user.click(screen.getByRole('button', { name: 'Add tool' }))
      await user.click(await screen.findByRole('menuitem', { name: 'API tool' }))
      const dialog = await screen.findByRole('dialog', { name: 'Add an API tool' })
      await user.type(within(dialog).getByLabelText('Name'), 'order LOOKUP')
      await user.type(within(dialog).getByLabelText('Address'), 'https://api.example.com/x')
      await user.type(within(dialog).getByLabelText('Arguments'), 'not json')
      await user.click(within(dialog).getByRole('button', { name: 'Save tool' }))
      expect(await within(dialog).findByText('Another tool already has this name.')).toBeVisible()
      expect(within(dialog).getByText('Enter a JSON object, or leave this empty.')).toBeVisible()
    })

    it('warns that a method other than GET changes data', async () => {
      const { user } = renderAgentEditor()
      await user.click(await screen.findByRole('button', { name: 'Add tool' }))
      await user.click(await screen.findByRole('menuitem', { name: 'API tool' }))
      const dialog = await screen.findByRole('dialog', { name: 'Add an API tool' })
      expect(within(dialog).queryByText(/changes data on the other side/)).not.toBeInTheDocument()
      await user.click(within(dialog).getByRole('combobox', { name: 'Method' }))
      await user.click(await screen.findByRole('option', { name: 'POST' }))
      expect(within(dialog).getByText('POST changes data on the other side')).toBeVisible()
      expect(within(dialog).getByText(/Sends a real POST request now/)).toBeVisible()
    })

    it('picks an account of the right kind', async () => {
      const { user } = renderAgentEditor()
      await user.click(await screen.findByRole('button', { name: 'Add tool' }))
      await user.click(await screen.findByRole('menuitem', { name: 'API tool' }))
      const dialog = await screen.findByRole('dialog', { name: 'Add an API tool' })
      await user.type(within(dialog).getByLabelText('Name'), 'Billing')
      await user.type(within(dialog).getByLabelText('Address'), 'https://billing.example.com/v1')
      await user.click(within(dialog).getByRole('combobox', { name: 'Account' }))
      const list = await screen.findByRole('listbox')
      expect(within(list).getByRole('option', { name: /No sign-in/ })).toBeVisible()
      expect(within(list).queryByRole('option', { name: /Docs MCP/ })).not.toBeInTheDocument()
      expect(within(list).queryByRole('option', { name: /Acme Slack/ })).not.toBeInTheDocument()
      await user.click(within(list).getByRole('option', { name: /Billing API/ }))
      await user.click(within(dialog).getByRole('button', { name: 'Save tool' }))
      await waitFor(async () => {
        expect(await savedTools()).toEqual([expect.objectContaining({ connectionId: BILLING_ID })])
      })
    })

    it('opens the Add connection dialog without saving the tool', async () => {
      const { user } = renderAgentEditor('admin')
      await user.click(await screen.findByRole('button', { name: 'Add tool' }))
      await user.click(await screen.findByRole('menuitem', { name: 'API tool' }))
      const dialog = await screen.findByRole('dialog', { name: 'Add an API tool' })
      await user.type(within(dialog).getByLabelText('Name'), 'Billing')
      await user.type(within(dialog).getByLabelText('Address'), 'https://billing.example.com/v1')
      await user.click(within(dialog).getByRole('button', { name: 'Add connection' }))
      expect(await screen.findByRole('dialog', { name: /Connect|Add connection/ })).toBeVisible()
      expect(await savedTools()).toEqual([])
    })
  })

  describe('the test call', () => {
    async function openDialogWith(address: string) {
      const view = renderAgentEditor()
      await view.user.click(await screen.findByRole('button', { name: 'Add tool' }))
      await view.user.click(await screen.findByRole('menuitem', { name: 'API tool' }))
      const dialog = await screen.findByRole('dialog', { name: 'Add an API tool' })
      await view.user.type(within(dialog).getByLabelText('Name'), 'Order lookup')
      await view.user.type(within(dialog).getByLabelText('Address'), address)
      return { ...view, dialog }
    }

    it('shows the status, the time and the start of the answer', async () => {
      const { user, dialog } = await openDialogWith('https://api.example.com/orders')
      const box = within(dialog).getByLabelText('Test arguments (JSON)')
      await user.clear(box)
      await user.click(box)
      await user.paste('{"orderId": "42"}')
      await user.click(within(dialog).getByRole('button', { name: 'Run test' }))
      expect(await within(dialog).findByText('Passed')).toBeVisible()
      expect(within(dialog).getByText('Status 200 · 142 ms')).toBeVisible()
      // the answer echoes the arguments back
      expect(within(dialog).getByText(/"received"/)).toBeVisible()
    })

    it('says why a call failed', async () => {
      const { user, dialog } = await openDialogWith('https://unreachable.example.com/orders')
      await user.click(within(dialog).getByRole('button', { name: 'Run test' }))
      expect(await within(dialog).findByText('Failed')).toBeVisible()
      expect(within(dialog).getByText(/Nothing answered at this address/)).toBeVisible()
    })

    it('shows an error status the address answered with', async () => {
      useScenarioFor(server, 'POST', 'failed', '/tools/test')
      const { user, dialog } = await openDialogWith('https://api.example.com/orders')
      await user.click(within(dialog).getByRole('button', { name: 'Run test' }))
      expect(await within(dialog).findByText('Failed')).toBeVisible()
      expect(within(dialog).getByText(/answered with an error/)).toBeVisible()
      expect(within(dialog).getByText(/Internal Server Error/)).toBeVisible()
    })

    it('does not send an address that is not valid, nor arguments that are not JSON', async () => {
      const { user, dialog } = await openDialogWith('nope')
      await user.click(within(dialog).getByRole('button', { name: 'Run test' }))
      expect(
        await within(dialog).findByText(/Enter an address that starts with https/),
      ).toBeVisible()
      expect(within(dialog).queryByText('Passed')).not.toBeInTheDocument()
      await user.clear(within(dialog).getByLabelText('Address'))
      await user.type(within(dialog).getByLabelText('Address'), 'https://api.example.com')
      const box = within(dialog).getByLabelText('Test arguments (JSON)')
      await user.clear(box)
      await user.type(box, 'oops')
      await user.click(within(dialog).getByRole('button', { name: 'Run test' }))
      expect(
        await within(dialog).findByText('Enter a JSON object, or leave this empty.'),
      ).toBeVisible()
      expect(within(dialog).queryByText('Passed')).not.toBeInTheDocument()
    })

    it('shows a failed request as an error, not a result', async () => {
      useScenarioFor(server, 'POST', 'error', '/tools/test')
      const { user, dialog } = await openDialogWith('https://api.example.com/orders')
      await user.click(within(dialog).getByRole('button', { name: 'Run test' }))
      expect(await within(dialog).findByRole('alert')).toBeVisible()
      expect(within(dialog).queryByText('Passed')).not.toBeInTheDocument()
    })
  })

  describe('adding an MCP server', () => {
    async function openMcpDialog(address = 'https://mcp.example.com/sse') {
      const view = renderAgentEditor()
      await view.user.click(await screen.findByRole('button', { name: 'Add tool' }))
      await view.user.click(await screen.findByRole('menuitem', { name: 'MCP server' }))
      const dialog = await screen.findByRole('dialog', { name: 'Add an MCP server' })
      await view.user.type(within(dialog).getByLabelText('Name'), 'Company wiki')
      await view.user.type(within(dialog).getByLabelText('Server address'), address)
      return { ...view, dialog }
    }

    it('finds the actions, lets some be turned off, and saves them with the server', async () => {
      const { user, dialog } = await openMcpDialog()
      await user.click(within(dialog).getByRole('button', { name: 'Find actions' }))
      expect(await within(dialog).findByRole('switch', { name: /search_pages/ })).toBeChecked()
      await user.click(within(dialog).getByRole('switch', { name: /delete_page/ }))
      await user.click(within(dialog).getByRole('combobox', { name: 'What create_page may do' }))
      await user.click(await screen.findByRole('option', { name: 'Ask first' }))
      await user.click(within(dialog).getByRole('button', { name: 'Save server' }))

      expect(await screen.findByText('Company wiki')).toBeVisible()
      await waitFor(async () => {
        const [saved] = await savedTools()
        expect(saved).toMatchObject({ kind: 'mcp', name: 'Company wiki', permission: 'read_only' })
        expect(saved?.kind === 'mcp' && saved.discoveredActions).toEqual([
          expect.objectContaining({ name: 'search_pages', enabled: true, permission: null }),
          expect.objectContaining({ name: 'get_page', enabled: true, permission: null }),
          expect.objectContaining({ name: 'create_page', enabled: true, permission: 'ask_first' }),
          expect.objectContaining({ name: 'delete_page', enabled: false, permission: null }),
        ])
      })
    })

    it('says why a server could not be reached', async () => {
      const { user, dialog } = await openMcpDialog('https://unreachable.example.com/sse')
      await user.click(within(dialog).getByRole('button', { name: 'Find actions' }))
      expect(await within(dialog).findByText('Couldn’t find actions')).toBeVisible()
      expect(within(dialog).getByText(/Nothing answered at this address/)).toBeVisible()
      expect(within(dialog).queryByRole('switch')).not.toBeInTheDocument()
    })

    it('keeps what was set when the actions are found again', async () => {
      await seedTools(DRAFT_AGENT_ID, wikiTool)
      const { user } = renderAgentEditor()
      await user.click(await screen.findByRole('button', { name: 'Edit Company wiki' }))
      const dialog = await screen.findByRole('dialog', { name: 'Edit MCP server' })
      await user.click(within(dialog).getByRole('switch', { name: /delete_page/ }))
      await user.click(within(dialog).getByRole('button', { name: 'Find again' }))
      expect(await within(dialog).findByRole('switch', { name: /get_page/ })).toBeChecked()
      expect(within(dialog).getByRole('switch', { name: /delete_page/ })).not.toBeChecked()
    })
  })

  it('changes the permission and switches a tool off', async () => {
    await seedTools(DRAFT_AGENT_ID, ordersTool)
    const { user } = renderAgentEditor()
    await user.click(await screen.findByRole('combobox', { name: 'What Order lookup may do' }))
    await user.click(await screen.findByRole('option', { name: 'Can act' }))
    await user.click(screen.getByRole('switch', { name: 'Use Order lookup' }))
    await waitFor(async () => {
      expect(await savedTools()).toEqual([
        expect.objectContaining({ id: ORDERS_ID, permission: 'can_act', enabled: false }),
      ])
    })
  })

  it('suggests an approval rule for a tool that can act without one', async () => {
    await seedTools(DRAFT_AGENT_ID, { ...ordersTool, permission: 'can_act' })
    renderAgentEditor()
    const row = (await screen.findByText('Order lookup')).closest('li') as HTMLElement
    expect(within(row).getByText(/Can act without asking/)).toBeVisible()
    expect(
      within(row).getByRole('link', { name: 'Add an approval rule in Guard' }),
    ).toHaveAttribute('href', `/acme/agents/${DRAFT_AGENT_ID}/guard`)
  })

  it('edits a tool and keeps its permission and switch', async () => {
    await seedTools(DRAFT_AGENT_ID, { ...ordersTool, permission: 'ask_first', enabled: false })
    const { user } = renderAgentEditor()
    await user.click(await screen.findByRole('button', { name: 'Edit Order lookup' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit API tool' })
    const name = within(dialog).getByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'Find order')
    await user.click(within(dialog).getByRole('button', { name: 'Save tool' }))
    expect(await screen.findByText('Find order')).toBeVisible()
    await waitFor(async () => {
      expect(await savedTools()).toEqual([
        expect.objectContaining({
          id: ORDERS_ID,
          name: 'Find order',
          permission: 'ask_first',
          enabled: false,
          url: 'https://api.example.com/orders',
        }),
      ])
    })
  })

  it('removes a tool and puts it back where it was with Undo', async () => {
    await seedTools(DRAFT_AGENT_ID, ordersTool, wikiTool)
    const { user } = renderAgentEditor()
    await user.click(await screen.findByRole('button', { name: 'Remove Order lookup' }))
    await waitFor(() => {
      expect(screen.queryByText('Order lookup', { selector: 'span' })).not.toBeInTheDocument()
    })
    await waitFor(async () => {
      expect((await savedTools()).map((tool) => tool.name)).toEqual(['Company wiki'])
    })
    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(await screen.findByText('Order lookup', { selector: 'span' })).toBeVisible()
    await waitFor(async () => {
      expect((await savedTools()).map((tool) => tool.name)).toEqual([
        'Order lookup',
        'Company wiki',
      ])
    })
  })

  it('shows a connection that failed, with Reconnect', async () => {
    await seedTools(DRAFT_AGENT_ID, ordersTool)
    renderAgentEditor()
    const row = (await screen.findByText('Order lookup')).closest('li') as HTMLElement
    expect(await within(row).findByText('Connection: Billing API')).toBeVisible()
    expect(within(row).getByText('Connection failed')).toBeVisible()
    expect(within(row).getByRole('link', { name: 'Reconnect' })).toHaveAttribute(
      'href',
      '/acme/settings/connections',
    )
  })

  it('marks an MCP server without a connection as not connected', async () => {
    await seedTools(DRAFT_AGENT_ID, { ...wikiTool, connectionId: null })
    renderAgentEditor()
    const row = (await screen.findByText('Company wiki')).closest('li') as HTMLElement
    expect(within(row).getByText('Not connected')).toBeVisible()
  })

  it('says when a connection is not one the person can see', async () => {
    await seedTools(DRAFT_AGENT_ID, { ...ordersTool, connectionId: fixtureUuid(76, 1) })
    renderAgentEditor()
    const row = (await screen.findByText('Order lookup')).closest('li') as HTMLElement
    expect(await within(row).findByText('Connection unavailable')).toBeVisible()
  })

  it('shows a read-only agent’s tools without anything to change', async () => {
    mockAgentId = READ_ONLY_AGENT_ID
    await seedTools(READ_ONLY_AGENT_ID, ordersTool)
    renderAgentEditor()
    const row = (await screen.findByText('Order lookup')).closest('li') as HTMLElement
    expect(within(row).getByText('Read only')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Add tool' })).not.toBeInTheDocument()
    expect(within(row).queryByRole('switch')).not.toBeInTheDocument()
    expect(within(row).queryByRole('button')).not.toBeInTheDocument()
  })
})
