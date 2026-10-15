// SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import type { OrgRole } from '@surefy/contracts'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import PromptLibrary from './PromptLibrary'
import { chatDomain, resetChatMock } from '../../../../mock/handlers/chat'
import { teamsDomain } from '../../../../mock/handlers/teams'

setupTestServer(...chatDomain.handlers, ...teamsDomain.handlers)

const onClose = vi.fn()
const onUse = vi.fn()

function renderLibrary(role: OrgRole = 'owner') {
  return renderWithProviders(<PromptLibrary orgId={ORG_ID} onClose={onClose} onUse={onUse} />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs(role)),
  })
}

beforeEach(() => {
  onClose.mockClear()
  onUse.mockClear()
  resetChatMock()
})

describe('PromptLibrary', () => {
  it('lists personal and shared prompts with who sees them and their variables', async () => {
    renderLibrary()
    const list = await screen.findByRole('list', { name: 'Prompts' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    const summary = within(list).getByRole('button', { name: 'Use prompt Summarize a document' })
    expect(within(summary).getByText('Only you')).toBeVisible()
    expect(within(summary).getByText('{document}')).toBeVisible()
    expect(within(summary).getByText('{audience}')).toBeVisible()
    const reply = within(list).getByRole('button', { name: 'Use prompt Reply to a customer' })
    expect(within(reply).getByText('Shared with Support')).toBeVisible()
  })

  it('searches the title and the text, and filters by who it is shared with', async () => {
    const { user } = renderLibrary()
    await screen.findByRole('list', { name: 'Prompts' })
    await user.type(screen.getByRole('searchbox', { name: 'Search prompts' }), 'friendly')
    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(1)
    })
    expect(screen.getByRole('button', { name: 'Use prompt Reply to a customer' })).toBeVisible()

    await user.clear(screen.getByRole('searchbox', { name: 'Search prompts' }))
    await user.click(screen.getByRole('radio', { name: 'Mine' }))
    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(2)
    })
    await user.type(screen.getByRole('searchbox', { name: 'Search prompts' }), 'nothing like this')
    expect(await screen.findByText('No prompts found')).toBeVisible()
  })

  it('hands a prompt without variables to the composer and closes', async () => {
    const { user } = renderLibrary()
    await user.click(await screen.findByRole('button', { name: 'Use prompt Explain simply' }))
    expect(onUse).toHaveBeenCalledWith('Explain this as if I were new to the topic.')
    expect(onClose).toHaveBeenCalled()
  })

  it('creates a prompt and lists the variables it found in the text', async () => {
    const { user } = renderLibrary()
    await screen.findByRole('list', { name: 'Prompts' })
    await user.click(screen.getByRole('button', { name: 'New prompt' }))
    const dialog = await screen.findByRole('dialog', { name: 'New prompt' })
    await user.type(within(dialog).getByLabelText('Title'), 'Meeting notes')
    await user.type(within(dialog).getByLabelText('Prompt'), 'Notes for {{meeting} on {{date}')
    expect(within(dialog).getByText('{meeting}')).toBeVisible()
    expect(within(dialog).getByText('{date}')).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Create prompt' }))
    expect(await screen.findByRole('button', { name: 'Use prompt Meeting notes' })).toBeVisible()
  })

  it('needs a title and a text', async () => {
    const { user } = renderLibrary()
    await user.click(await screen.findByRole('button', { name: 'New prompt' }))
    const dialog = await screen.findByRole('dialog', { name: 'New prompt' })
    await user.click(within(dialog).getByRole('button', { name: 'Create prompt' }))
    expect(dialog).toBeVisible()
    await waitFor(() => {
      expect(within(dialog).getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true')
    })
  })

  it('shares a prompt with a team (Builders and above)', async () => {
    const { user } = renderLibrary('builder')
    await user.click(await screen.findByRole('button', { name: 'New prompt' }))
    const dialog = await screen.findByRole('dialog', { name: 'New prompt' })
    await user.type(within(dialog).getByLabelText('Title'), 'Escalation')
    await user.type(within(dialog).getByLabelText('Prompt'), 'Escalate {{ticket}')
    await user.click(within(dialog).getByRole('radio', { name: /Shared/ }))
    expect(await within(dialog).findByText('Teams')).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Create prompt' }))
    const created = await screen.findByRole('button', { name: 'Use prompt Escalation' })
    expect(within(created).getByText('Everyone in the organization')).toBeVisible()
  })

  it('keeps a person without the right to share prompts on personal ones', async () => {
    const { user } = renderLibrary('user')
    await user.click(await screen.findByRole('button', { name: 'New prompt' }))
    const dialog = await screen.findByRole('dialog', { name: 'New prompt' })
    expect(within(dialog).queryByRole('radio', { name: /Shared/ })).not.toBeInTheDocument()
  })

  it('edits a prompt', async () => {
    const { user } = renderLibrary()
    await user.click(await screen.findByRole('button', { name: 'Actions for Explain simply' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit prompt' })
    const title = within(dialog).getByLabelText('Title')
    await user.clear(title)
    await user.type(title, 'Explain it simply')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    expect(
      await screen.findByRole('button', { name: 'Use prompt Explain it simply' }),
    ).toBeVisible()
  })

  it('deletes a personal prompt at once and restores it with Undo', async () => {
    const { user } = renderLibrary()
    await user.click(await screen.findByRole('button', { name: 'Actions for Explain simply' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'Use prompt Explain simply' }),
      ).not.toBeInTheDocument()
    })
    // the toast sits outside the dialog, which blocks pointer events on everything else in tests
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(await screen.findByRole('button', { name: 'Use prompt Explain simply' })).toBeVisible()
  })

  it('asks before deleting a shared prompt and names who loses it', async () => {
    const { user } = renderLibrary()
    await user.click(await screen.findByRole('button', { name: 'Actions for Reply to a customer' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('It is shared with Support.')).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Delete prompt' }))
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'Use prompt Reply to a customer' }),
      ).not.toBeInTheDocument()
    })
  })
})
