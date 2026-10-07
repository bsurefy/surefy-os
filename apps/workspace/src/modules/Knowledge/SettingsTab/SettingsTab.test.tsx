// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import {
  HELP_CENTER_ID,
  knowledgeDomain,
  LEGACY_NOTES_ID,
  resetKnowledgeMock,
} from '../../../../mock/handlers/knowledge'
import { modelsDomain, NOMIC_MODEL_ID, resetModelsMock } from '../../../../mock/handlers/models'
import { resetTeamsMock, teamsDomain } from '../../../../mock/handlers/teams'
import { resetVaultMock, vaultDomain } from '../../../../mock/handlers/vault'
import KnowledgeBaseDetail from '../KnowledgeBaseDetail'

let mockParams: { orgSlug: string; kbId: string; tab?: string }

vi.mock('next/navigation', () => ({
  useParams: () => mockParams,
  useRouter: () => ({ push: vi.fn() }),
}))

const server = setupTestServer(
  ...knowledgeDomain.handlers,
  ...teamsDomain.handlers,
  ...modelsDomain.handlers,
  ...vaultDomain.handlers,
)

function renderSettings(kbId = HELP_CENTER_ID, role: 'admin' | 'builder' = 'admin') {
  mockParams = { orgSlug: 'acme', kbId, tab: 'settings' }
  return renderWithProviders(<KnowledgeBaseDetail />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs(role)),
  })
}

/** The Vault ships with one local embedding model disabled; an Admin enables it. */
async function enableLocalEmbedding() {
  await fetch(`http://localhost:3000/api/v1/orgs/${ORG_ID}/vault/models/${NOMIC_MODEL_ID}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ isEnabled: true }),
  })
}

beforeEach(() => {
  resetKnowledgeMock()
  resetTeamsMock()
  resetModelsMock()
  resetVaultMock()
})

afterEach(() => {
  server.events.removeAllListeners()
})

describe('SettingsTab', () => {
  it('shows the name, the embedding model and the chunking preset', async () => {
    renderSettings()
    expect(await screen.findByRole('heading', { name: 'Embedding model', level: 2 })).toBeVisible()
    expect(screen.getByText('Articles and policies the support team answers from.')).toBeVisible()
    expect(await screen.findByRole('combobox', { name: 'Embedding model' })).toHaveTextContent(
      'Text embedding 3 small',
    )
    expect(screen.getByRole('combobox', { name: 'Chunking preset' })).toHaveTextContent('Default')
  })

  it('shows the embedding model read-only to people who are not Admins', async () => {
    renderSettings(HELP_CENTER_ID, 'builder')
    expect(
      await screen.findByText('Only Admins and Owners can change the embedding model.'),
    ).toBeVisible()
    expect(screen.queryByRole('combobox', { name: 'Embedding model' })).not.toBeInTheDocument()
  })

  it('confirms a new chunking preset with the time it takes, then shows it re-indexing', async () => {
    const { user } = renderSettings()
    await user.click(await screen.findByRole('combobox', { name: 'Chunking preset' }))
    await user.click(await screen.findByRole('option', { name: 'FAQs' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Change the chunking preset?' })
    expect(
      await within(dialog).findByText(/Search quality may drop until 21 passages/),
    ).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Change preset' }))
    expect((await screen.findAllByText(/documents re-indexed/)).length).toBeGreaterThan(0)
    expect(screen.getByRole('combobox', { name: 'Chunking preset' })).toBeDisabled()
  })

  it('cancels a re-index that is running', async () => {
    const { user } = renderSettings()
    await user.click(await screen.findByRole('combobox', { name: 'Chunking preset' }))
    await user.click(await screen.findByRole('option', { name: 'FAQs' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Change the chunking preset?' })
    await user.click(await within(dialog).findByRole('button', { name: 'Change preset' }))
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => {
      expect(screen.queryAllByText(/documents re-indexed/)).toHaveLength(0)
    })
  })

  it('changes the embedding model after a T2 confirmation', async () => {
    await enableLocalEmbedding()
    const { user } = renderSettings()
    await user.click(await screen.findByRole('combobox', { name: 'Embedding model' }))
    await user.click(await screen.findByRole('option', { name: 'nomic-embed-text' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Change the embedding model?' })
    await user.click(await within(dialog).findByRole('button', { name: 'Change model' }))
    expect(await screen.findByText('Re-indexing with nomic-embed-text')).toBeVisible()
  })

  it('lets a base with no model start using one without a re-index', async () => {
    await enableLocalEmbedding()
    const { user } = renderSettings(LEGACY_NOTES_ID)
    await user.click(await screen.findByRole('combobox', { name: 'Embedding model' }))
    await user.click(await screen.findByRole('option', { name: 'Text embedding 3 small' }))
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Embedding model' })).toHaveTextContent(
        'Text embedding 3 small',
      )
    })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('explains that Local models only needs a local embedding model', async () => {
    const { user } = renderSettings()
    await user.click(await screen.findByRole('switch', { name: /Local models only/ }))
    expect(
      await screen.findByText(
        'A knowledge base limited to local models needs a local embedding model.',
      ),
    ).toBeVisible()
  })

  it('opens rename and the typed delete from the page', async () => {
    const { user } = renderSettings()
    await user.click(await screen.findByRole('button', { name: 'Rename' }))
    expect(await screen.findByRole('dialog', { name: 'Rename knowledge base' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Delete knowledge base' }))
    expect(await screen.findByRole('alertdialog', { name: 'Delete Help center?' })).toBeVisible()
  })
})
