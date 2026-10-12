// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  agentEditorHandlers,
  leaveAgentEditor,
  renderAgentEditor,
  useScenarioFor,
} from '@/test/agentEditor'
import { setupTestServer } from '@surefy/web-core/testing'

import {
  DRAFT_AGENT_ID,
  resetAgentsMock,
  SUPPORT_AGENT_ID,
} from '../../../../../mock/handlers/agents'
import { resetKnowledgeMock } from '../../../../../mock/handlers/knowledge'
import { resetModelsMock } from '../../../../../mock/handlers/models'
import { resetTeamsMock } from '../../../../../mock/handlers/teams'
import { resetVaultMock } from '../../../../../mock/handlers/vault'

let mockAgentId = SUPPORT_AGENT_ID

vi.mock('next/navigation', () => ({
  useParams: () => ({ orgSlug: 'acme', agentId: mockAgentId, tab: 'versions' }),
  useRouter: () => ({ push: vi.fn() }),
}))

const server = setupTestServer(...agentEditorHandlers)

beforeEach(() => {
  mockAgentId = SUPPORT_AGENT_ID
  localStorage.clear()
  resetAgentsMock()
  resetKnowledgeMock()
  resetModelsMock()
  resetTeamsMock()
  resetVaultMock()
})

afterEach(async () => {
  await leaveAgentEditor(server)
  server.events.removeAllListeners()
})

const rowOf = async (version: number) =>
  (await screen.findByText(`Version ${version}`)).closest('li') as HTMLElement

describe('VersionsTab', () => {
  it('lists the versions newest first, with the live one marked', async () => {
    renderAgentEditor()
    await rowOf(3)
    const versions = screen
      .getAllByRole('listitem')
      .filter((row) => /^Version \d/.test(row.textContent))
    expect(versions.map((row) => /^Version \d/.exec(row.textContent)?.[0])).toEqual([
      'Version 3',
      'Version 2',
      'Version 1',
    ])
    expect(within(await rowOf(3)).getByText('Live')).toBeVisible()
    expect(within(await rowOf(2)).queryByText('Live')).not.toBeInTheDocument()
  })

  it('shows who published a version, when, and the notes', async () => {
    renderAgentEditor()
    const row = await rowOf(3)
    expect(within(row).getByText(/Published by Omar Haddad/)).toBeVisible()
    expect(within(row).getByText('Added the help center')).toBeVisible()
  })

  it('shows what a version changed from the one before it', async () => {
    const { user } = renderAgentEditor()
    const row = await rowOf(2)
    await user.click(within(row).getByRole('button', { name: /Show what version 2 changed/ }))
    expect(await within(row).findByText('Instructions changed')).toBeVisible()
    expect(within(row).getByText('Creativity 20% → 30%')).toBeVisible()
    await user.click(within(row).getByRole('button', { name: /Hide what version 2 changed/ }))
    expect(within(row).queryByText('Instructions changed')).not.toBeInTheDocument()
  })

  it('says so when a version changed nothing, and for the first version', async () => {
    const { user } = renderAgentEditor()
    const latest = await rowOf(3)
    await user.click(within(latest).getByRole('button', { name: /Show what version 3 changed/ }))
    expect(
      await within(latest).findByText('Nothing changed from the version before.'),
    ).toBeVisible()
    const first = await rowOf(1)
    await user.click(within(first).getByRole('button', { name: /Show what version 1 changed/ }))
    expect(await within(first).findByText('The first published version.')).toBeVisible()
  })

  it('rolls back after confirming, and the earlier version becomes the live one', async () => {
    const { user } = renderAgentEditor()
    const row = await rowOf(2)
    expect(within(await rowOf(3)).queryByRole('button', { name: /Roll back/ })).toBeNull()
    await user.click(within(row).getByRole('button', { name: 'Roll back to version 2' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(
      within(dialog).getByText('Version 2 goes live for everyone using this agent.'),
    ).toBeVisible()
    expect(within(dialog).getByText(/Your draft stays as it is/)).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Roll back to v2' }))
    await waitFor(async () => {
      expect(within(await rowOf(2)).getByText('Live')).toBeVisible()
    })
    expect(within(await rowOf(3)).queryByText('Live')).not.toBeInTheDocument()
  })

  it('keeps the dialog open with the reason when the roll back fails', async () => {
    useScenarioFor(server, 'POST', 'error', '/rollback')
    const { user } = renderAgentEditor()
    await user.click(within(await rowOf(2)).getByRole('button', { name: 'Roll back to version 2' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Roll back to v2' }))
    expect(await within(dialog).findByText(/Something went wrong/i)).toBeVisible()
    expect(screen.getByRole('alertdialog')).toBeVisible()
  })

  it('offers no roll back to someone who cannot publish', async () => {
    renderAgentEditor('user')
    await rowOf(2)
    expect(screen.queryByRole('button', { name: /Roll back/ })).not.toBeInTheDocument()
  })

  it('invites to publish when nothing is published yet', async () => {
    mockAgentId = DRAFT_AGENT_ID
    renderAgentEditor()
    expect(await screen.findByText('No versions yet')).toBeVisible()
  })

  it('explains a failure to load, and tries again', async () => {
    useScenarioFor(server, 'GET', 'error', '/versions')
    const { user } = renderAgentEditor()
    expect(await screen.findByText("Couldn't load the versions")).toBeVisible()
    server.events.removeAllListeners()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await rowOf(3)).toBeVisible()
  })
})
