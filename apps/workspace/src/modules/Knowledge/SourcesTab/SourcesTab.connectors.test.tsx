// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import { connectionsDomain, resetConnectionsMock } from '../../../../mock/handlers/connections'
import {
  HELP_CENTER_ID,
  knowledgeDomain,
  resetKnowledgeMock,
  SALES_PLAYBOOK_ID,
} from '../../../../mock/handlers/knowledge'
import { resetTeamsMock, teamsDomain } from '../../../../mock/handlers/teams'
import KnowledgeBaseDetail from '../KnowledgeBaseDetail'

let mockParams: { orgSlug: string; kbId: string; tab?: string }

vi.mock('next/navigation', () => ({
  useParams: () => mockParams,
  useRouter: () => ({ push: vi.fn() }),
}))

const server = setupTestServer(
  ...knowledgeDomain.handlers,
  ...teamsDomain.handlers,
  ...connectionsDomain.handlers,
)

function renderSources(kbId: string, searchParams?: string) {
  mockParams = { orgSlug: 'acme', kbId, tab: 'sources' }
  return renderWithProviders(<KnowledgeBaseDetail />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs('admin')),
    searchParams,
  })
}

/** Forces a scenario on the mocked requests to a path of this test. */
function useScenario(pathPart: string, scenario: string) {
  server.events.on('request:start', ({ request }) => {
    if (request.url.includes(pathPart)) request.headers.set('x-mock-scenario', scenario)
  })
}

const rowOf = (name: string) =>
  waitFor(() => {
    const row = screen
      .queryAllByText(name)
      .map((element) => element.closest('tr'))
      .find(Boolean)
    if (!row) throw new Error(`No row for ${name}`)
    return row
  })

/** Waits for the folder list of the open dialog to show `name`. */
const findItem = (dialog: HTMLElement, name: string) =>
  within(dialog).findByRole('checkbox', { name: new RegExp(`^${name}`) })

beforeEach(() => {
  resetKnowledgeMock()
  resetTeamsMock()
  resetConnectionsMock()
})

afterEach(() => {
  server.events.removeAllListeners()
  vi.restoreAllMocks()
})

describe('SourcesTab connectors', () => {
  it('lists connector sources with their app, folders and last sync', async () => {
    renderSources(SALES_PLAYBOOK_ID)
    const drive = await rowOf('Sales decks')
    expect(drive).toHaveTextContent('GD')
    expect(drive).toHaveTextContent('Google Drive · Sales decks')
    expect(drive).toHaveTextContent('Ready')
    expect(drive).toHaveTextContent(/Synced .*ago/)

    const notion = await rowOf('Sales wiki')
    expect(notion).toHaveTextContent('Paused')
    expect(notion).toHaveTextContent('The sign-in expired · Reconnect')

    // one Google Drive source and one Notion source
    expect(await screen.findAllByText('1 source syncing')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Add folders Google Drive' })).toBeEnabled()
  })

  it('says which sign-in expired and reconnects it from the banner', async () => {
    const { user } = renderSources(SALES_PLAYBOOK_ID)
    expect(await screen.findByText('The Notion sign-in expired')).toBeVisible()
    expect(
      screen.getByText(
        'Syncing 1 source is paused. Its passages stay searchable until you reconnect.',
      ),
    ).toBeVisible()

    await user.click(await screen.findByRole('button', { name: 'Reconnect' }))
    expect(await screen.findByRole('dialog', { name: "Reconnect Omar's Notion" })).toBeVisible()
  })

  it('offers Reconnect instead of Retry and Sync now for a paused connector', async () => {
    const { user } = renderSources(SALES_PLAYBOOK_ID)
    await screen.findByRole('button', { name: 'Reconnect' })
    await user.click(screen.getByRole('button', { name: 'Actions for Sales wiki' }))
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'Reconnect' })).toBeVisible()
    expect(within(menu).getByRole('menuitem', { name: 'Choose pages' })).toBeVisible()
    expect(within(menu).queryByRole('menuitem', { name: 'Retry' })).not.toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'Sync now' })).not.toBeInTheDocument()
  })

  it('connects Google Drive: the only account is picked, folders are browsed and synced', async () => {
    const { user } = renderSources(HELP_CENTER_ID)
    await user.click(await screen.findByRole('button', { name: 'Connect Google Drive' }))
    const dialog = await screen.findByRole('dialog', { name: 'Connect Google Drive' })

    await user.click(await findItem(dialog, 'My Drive'))
    await user.click(within(dialog).getByRole('button', { name: 'Open Shared drives' }))
    await user.click(await findItem(dialog, 'Finance'))
    expect(within(dialog).getByText('2 selected')).toBeVisible()
    expect(within(dialog).getByRole('navigation', { name: 'Location' })).toHaveTextContent(
      'Shared drives',
    )

    await user.click(within(dialog).getByRole('radio', { name: 'Every hour' }))
    await user.click(within(dialog).getByRole('button', { name: 'Connect and sync' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    const row = await rowOf('My Drive + 1 more')
    expect(row).toHaveTextContent('Google Drive · My Drive + 1 more')
  })

  it('searches the whole account and shows where each match is', async () => {
    const { user } = renderSources(HELP_CENTER_ID, `?connect=google_drive`)
    const dialog = await screen.findByRole('dialog', { name: 'Connect Google Drive' })
    await findItem(dialog, 'My Drive')
    await user.type(within(dialog).getByRole('searchbox', { name: 'Search folders' }), 'pub')
    expect(await within(dialog).findByText('My Drive › Support › Public')).toBeVisible()
    expect(within(dialog).queryByRole('navigation', { name: 'Location' })).not.toBeInTheDocument()
  })

  it('says when nothing matches the search', async () => {
    const { user } = renderSources(HELP_CENTER_ID, '?connect=google_drive')
    const dialog = await screen.findByRole('dialog', { name: 'Connect Google Drive' })
    await findItem(dialog, 'My Drive')
    await user.type(within(dialog).getByRole('searchbox', { name: 'Search folders' }), 'zzz')
    expect(await within(dialog).findByText('No folders match')).toBeVisible()
  })

  it('shows an error with Try again when the folders do not load', async () => {
    useScenario('/connector-items', 'error')
    renderSources(HELP_CENTER_ID, '?connect=google_drive')
    const dialog = await screen.findByRole('dialog', { name: 'Connect Google Drive' })
    expect(await within(dialog).findByText("The list didn't load")).toBeVisible()
    expect(within(dialog).getByRole('button', { name: /Try again/ })).toBeVisible()
  })

  it('asks for at least one folder', async () => {
    const { user } = renderSources(HELP_CENTER_ID, '?connect=google_drive')
    const dialog = await screen.findByRole('dialog', { name: 'Connect Google Drive' })
    await findItem(dialog, 'My Drive')
    await user.click(within(dialog).getByRole('button', { name: 'Connect and sync' }))
    expect(await within(dialog).findByText('Choose at least one folder')).toBeVisible()
  })

  it('shows Reconnect in place of the folders when the sign-in expired', async () => {
    useScenario('/connector-items', 'connection-expired')
    renderSources(HELP_CENTER_ID, '?connect=google_drive')
    const dialog = await screen.findByRole('dialog', { name: 'Connect Google Drive' })
    expect(await within(dialog).findByText('The sign-in for maya@acme.test expired')).toBeVisible()
    expect(within(dialog).getByRole('button', { name: 'Reconnect' })).toBeVisible()
  })

  it('changes the folders of a connector, keeping its own folders pickable', async () => {
    const { user } = renderSources(SALES_PLAYBOOK_ID)
    await user.click(await screen.findByRole('button', { name: 'Actions for Sales decks' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Choose folders' }))
    const dialog = await screen.findByRole('dialog', { name: 'Change Sales decks' })
    expect(within(dialog).getByText('maya@acme.test')).toBeVisible()

    await user.click(within(dialog).getByRole('button', { name: 'Open Shared drives' }))
    const own = await findItem(dialog, 'Sales decks')
    expect(own).toBeChecked()
    expect(own).toBeEnabled()
    await user.click(await findItem(dialog, 'Finance'))
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(await rowOf('Sales decks')).toHaveTextContent('Google Drive · Sales decks + 1 more')
  })

  it('opens from the address an account sign-in returns to and lists Notion pages', async () => {
    renderSources(HELP_CENTER_ID, '?connect=notion')
    const dialog = await screen.findByRole('dialog', { name: 'Connect Notion' })
    expect(await findItem(dialog, 'Support workspace')).not.toBeChecked()
    expect(within(dialog).getByRole('checkbox', { name: 'Customer FAQ' })).toBeVisible()
    expect(within(dialog).getByText('Child pages are included.')).toBeVisible()
  })
})
