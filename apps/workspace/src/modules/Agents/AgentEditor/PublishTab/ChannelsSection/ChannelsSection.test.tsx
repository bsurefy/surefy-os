// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  agentEditorHandlers,
  leaveAgentEditor,
  renderAgentEditor,
  useScenarioFor,
} from '@/test/agentEditor'
import { ERROR_CODES } from '@surefy/contracts'
import type { AgentChannelDto, WidgetChannelConfig } from '@surefy/contracts'
import { setupTestServer } from '@surefy/web-core/testing'

import { agentChannelFixture } from '../../../../../../mock/handlers/agentChannels'
import {
  READ_ONLY_AGENT_ID,
  resetAgentsMock,
  setMockAgentChannels,
  SUPPORT_AGENT_ID,
} from '../../../../../../mock/handlers/agents'
import {
  resetConnectionsMock,
  SLACK_ID,
  WHATSAPP_ID,
} from '../../../../../../mock/handlers/connections'
import { resetKnowledgeMock } from '../../../../../../mock/handlers/knowledge'
import { resetModelsMock } from '../../../../../../mock/handlers/models'
import { resetTeamsMock } from '../../../../../../mock/handlers/teams'
import { resetVaultMock } from '../../../../../../mock/handlers/vault'

import type * as AgentEditorConstants from '../../AgentEditor.constants'

let mockAgentId = SUPPORT_AGENT_ID

vi.mock('next/navigation', () => ({
  useParams: () => ({ orgSlug: 'acme', agentId: mockAgentId, tab: 'publish' }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('../../AgentEditor.constants', async (importOriginal) => ({
  ...(await importOriginal<typeof AgentEditorConstants>()),
  AUTOSAVE_DELAY_MS: 20,
}))

const server = setupTestServer(...agentEditorHandlers)

beforeEach(() => {
  mockAgentId = SUPPORT_AGENT_ID
  localStorage.clear()
  resetAgentsMock()
  resetConnectionsMock()
  resetKnowledgeMock()
  resetModelsMock()
  resetTeamsMock()
  resetVaultMock()
})

afterEach(async () => {
  await leaveAgentEditor(server)
  server.events.removeAllListeners()
})

const card = (name: string) => screen.findByRole('group', { name })
const publishButton = () => screen.findByRole('button', { name: /^Publish v\d/ })
const WIDGET_CONFIG: WidgetChannelConfig = {
  allowedOrigins: ['https://www.acme.com'],
  greeting: '',
  theme: 'auto',
  position: 'bottom_right',
}

/** Gives "Support triage" live channels, as if published and approved before. */
function seedChannels(
  ...channels: [
    Parameters<typeof agentChannelFixture>[1],
    AgentChannelDto['status'],
    Partial<AgentChannelDto>?,
  ][]
) {
  setMockAgentChannels(
    SUPPORT_AGENT_ID,
    channels.map(
      ([request, status, overrides]) =>
        agentChannelFixture({ id: SUPPORT_AGENT_ID }, request, status, overrides).channel,
    ),
  )
}

async function setUpWidget(user: ReturnType<typeof renderAgentEditor>['user'], origins: string) {
  await user.click(await screen.findByRole('button', { name: 'Set up the widget' }))
  const dialog = await screen.findByRole('dialog', { name: 'Set up the website widget' })
  const websites = within(dialog).getByRole('textbox', { name: 'Websites' })
  await user.clear(websites)
  await user.type(websites, origins)
  await user.click(within(dialog).getByRole('radio', { name: 'Dark' }))
  await user.click(within(dialog).getByRole('button', { name: 'Add widget' }))
  return dialog
}

describe('ChannelsSection website widget', () => {
  it('sets the widget up for the next publish, and shows its embed code once', async () => {
    const { user } = renderAgentEditor('admin')
    const dialog = await setUpWidget(user, 'acme.com')
    expect(await within(dialog).findByText('Not a website address: acme.com')).toBeVisible()

    const websites = within(dialog).getByRole('textbox', { name: 'Websites' })
    await user.clear(websites)
    await user.type(websites, 'https://www.acme.com/help\nhttps://www.acme.com/shop')
    await user.click(within(dialog).getByRole('button', { name: 'Add widget' }))

    const widget = await card('Website widget')
    expect(within(widget).getByText('With the next publish')).toBeVisible()
    expect(within(widget).getByText('Goes live when you publish.')).toBeVisible()
    expect(within(widget).getByText('Loads on https://www.acme.com')).toBeVisible()
    expect(within(widget).getByText('Dark theme · Bottom right')).toBeVisible()
    expect(
      within(widget).getByText(/Anyone using the website widget can get answers from Help center/),
    ).toBeVisible()

    await user.click(await publishButton())
    const embed = await screen.findByRole('dialog', { name: 'Your embed code' })
    const code = within(embed).getByRole<HTMLTextAreaElement>('textbox', { name: 'Embed code' })
    expect(code.value).toMatch(
      /^<script src="http:\/\/localhost:3000\/widget\/v1\/widget\.js" data-token="wt_\w{43}" async><\/script>$/,
    )
    expect(within(embed).getByText(/You won't be able to see this again/)).toBeVisible()

    await user.click(within(embed).getByRole('button', { name: 'Done' }))
    expect(await within(embed).findByText('Close without copying?')).toBeVisible()
    await user.click(within(embed).getByRole('button', { name: 'Close anyway' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Your embed code' })).not.toBeInTheDocument()
    })
    expect(within(await card('Website widget')).getByText('Live')).toBeVisible()
  })

  it('sends a Builder’s widget to an admin, and lets the Builder take the request back', async () => {
    useScenarioFor(server, 'POST', 'pending-approval', '/publish')
    const { user } = renderAgentEditor('builder')
    await setUpWidget(user, 'https://www.acme.com')
    expect(
      await screen.findByText(
        'When you publish, an admin is asked to approve publishing to the website widget. The rest goes live meanwhile.',
      ),
    ).toBeVisible()

    await user.click(await publishButton())
    expect(
      await screen.findByText(
        'Waiting for an admin to approve publishing to the website widget. The rest is live.',
      ),
    ).toBeVisible()
    const widget = await card('Website widget')
    expect(
      await within(widget).findByText(
        'Waiting for an admin to approve publishing to the website widget',
      ),
    ).toBeVisible()
    // no token while it waits
    expect(screen.queryByRole('dialog', { name: 'Your embed code' })).not.toBeInTheDocument()

    await user.click(within(widget).getByRole('button', { name: 'Withdraw request' }))
    expect(await within(widget).findByRole('button', { name: 'Set up the widget' })).toBeVisible()
    expect(within(widget).getByText('Off')).toBeVisible()
  })

  it('offers the embed code of a widget approved after a request once', async () => {
    seedChannels([{ type: 'widget', config: WIDGET_CONFIG }, 'active', { publicTokenPrefix: null }])
    const { user } = renderAgentEditor('builder')
    const widget = await card('Website widget')
    await user.click(await within(widget).findByRole('button', { name: 'Get embed code' }))
    const embed = await screen.findByRole('dialog', { name: 'Your embed code' })
    await user.click(within(embed).getByRole('button', { name: 'Copy code' }))
    await user.click(within(embed).getByRole('button', { name: 'Done' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Your embed code' })).not.toBeInTheDocument()
    })
    await waitFor(() => {
      expect(
        within(widget).queryByRole('button', { name: 'Get embed code' }),
      ).not.toBeInTheDocument()
    })
    // only an admin replaces the code later
    expect(within(widget).queryByRole('button', { name: 'New embed code' })).not.toBeInTheDocument()
  })

  it('lets an Admin replace the code, change the websites and pause the widget', async () => {
    seedChannels([{ type: 'widget', config: WIDGET_CONFIG }, 'active'])
    const { user } = renderAgentEditor('admin')
    const widget = await card('Website widget')

    await user.click(await within(widget).findByRole('button', { name: 'New embed code' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Get a new embed code?' })
    expect(within(confirm).getByText(/The current code stops working at once/)).toBeVisible()
    await user.click(within(confirm).getByRole('button', { name: 'Get new code' }))
    expect(await screen.findByRole('dialog', { name: 'Your embed code' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Copy code' }))
    await user.click(screen.getByRole('button', { name: 'Done' }))

    await user.click(within(widget).getByRole('button', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog', { name: 'Website widget' })
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Websites' }),
      '\nhttps://shop.acme.com',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(
      await within(widget).findByText('Loads on https://www.acme.com, https://shop.acme.com'),
    ).toBeVisible()

    await user.click(within(widget).getByRole('button', { name: 'Pause' }))
    const pause = await screen.findByRole('alertdialog', { name: 'Pause the website widget?' })
    await user.click(within(pause).getByRole('button', { name: 'Pause' }))
    expect(await within(widget).findByText('Paused')).toBeVisible()
    await user.click(within(widget).getByRole('button', { name: 'Resume' }))
    expect(await within(widget).findByText('Live')).toBeVisible()
  })
})

describe('ChannelsSection Slack and WhatsApp', () => {
  it('sets Slack up with a connection, then shows the request URL to paste', async () => {
    const { user } = renderAgentEditor('admin')
    await user.click(await screen.findByRole('button', { name: 'Set up Slack' }))
    const dialog = await screen.findByRole('dialog', { name: 'Set up Slack' })
    await user.click(within(dialog).getByRole('button', { name: 'Add' }))
    expect(await within(dialog).findByText('Choose a connection.')).toBeVisible()

    await user.click(within(dialog).getByRole('combobox', { name: 'Connection' }))
    await user.click(await screen.findByRole('option', { name: /Acme Slack/ }))
    await user.type(within(dialog).getByRole('textbox', { name: 'Channel IDs' }), 'C0123 C0456')
    await user.click(within(dialog).getByRole('button', { name: 'Add' }))

    const slack = await card('Slack')
    expect(within(slack).getByText('With the next publish')).toBeVisible()
    expect(await within(slack).findByText('Answers through Acme Slack · Expired')).toBeVisible()
    expect(within(slack).getByText('Answers when mentioned in C0123 and C0456')).toBeVisible()

    await user.click(await publishButton())
    expect(await within(slack).findByText('Live')).toBeVisible()
    expect(
      within(slack).getByRole<HTMLInputElement>('textbox', { name: 'Request URL' }).value,
    ).toBe('https://api.example.com/api/v1/channels/slack/events')
  })

  it('shows the callback URL and the verify token for WhatsApp', async () => {
    seedChannels([
      {
        type: 'whatsapp',
        connectionId: WHATSAPP_ID,
        config: { businessAccountId: '1029384756', welcomeMessage: '' },
      },
      'active',
      { externalAccountId: '5550001111' },
    ])
    renderAgentEditor('admin')
    const whatsapp = await card('WhatsApp')
    expect(await within(whatsapp).findByText('Answers on phone number ID 5550001111')).toBeVisible()
    expect(
      within(whatsapp).getByRole<HTMLInputElement>('textbox', { name: 'Callback URL' }).value,
    ).toBe('https://api.example.com/api/v1/channels/whatsapp/webhook')
    expect(
      within(whatsapp).getByRole<HTMLInputElement>('textbox', { name: 'Verify token' }).value,
    ).toMatch(/^wv_/)
    expect(within(whatsapp).getByRole('button', { name: 'Copy Verify token' })).toBeVisible()
  })

  it('says why a channel stopped answering, and how to reconnect it', async () => {
    seedChannels([
      { type: 'slack', connectionId: SLACK_ID, config: { respondTo: 'mentions', channelIds: [] } },
      'error',
      { lastErrorCode: ERROR_CODES.CONNECTION_TOKEN_EXPIRED },
    ])
    const { user } = renderAgentEditor('admin')
    const slack = await card('Slack')
    expect(await within(slack).findByText('Stopped answering on Slack')).toBeVisible()
    expect(
      within(slack).getByText("This connection's sign-in expired. Reconnect it to keep using it."),
    ).toBeVisible()
    expect(within(slack).getByRole('link', { name: 'Reconnect' })).toHaveAttribute(
      'href',
      '/acme/settings/connections',
    )
    // the connection is still expired: trying again changes nothing
    await user.click(within(slack).getByRole('button', { name: 'Try again' }))
    expect(
      await screen.findByText('The app rejected these credentials. Check them and try again.'),
    ).toBeVisible()
    expect(within(slack).getByText('Error')).toBeVisible()
  })

  it('offers nothing to change to someone who may only read the agent', async () => {
    mockAgentId = READ_ONLY_AGENT_ID
    renderAgentEditor('builder')
    expect(await card('Website widget')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Set up the widget' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Set up Slack' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Set up WhatsApp' })).not.toBeInTheDocument()
  })
})
