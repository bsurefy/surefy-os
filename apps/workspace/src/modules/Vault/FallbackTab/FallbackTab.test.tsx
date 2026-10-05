// SPDX-License-Identifier: AGPL-3.0-only
import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import FallbackTab from './FallbackTab'
import { modelsDomain, resetModelsMock } from '../../../../mock/handlers/models'

vi.mock('next/navigation', () => ({ useParams: () => ({ orgSlug: 'acme' }) }))

const server = setupTestServer(...modelsDomain.handlers)

function renderFallback() {
  return renderWithProviders(<FallbackTab />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs('admin')),
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
  resetModelsMock()
})

describe('FallbackTab', () => {
  it('shows the order and where requests go', async () => {
    renderFallback()
    expect(await screen.findByText('Requests go to GPT-4.1 → llama3.1:70b')).toBeVisible()
    const order = screen.getByRole('list', { name: 'Fallback order' })
    const items = within(order).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('GPT-4.1')
    expect(items[1]).toHaveTextContent('llama3.1:70b')
  })

  it('reorders with the move buttons and saves with the save bar', async () => {
    const { user } = renderFallback()
    await user.click(await screen.findByRole('button', { name: 'Move llama3.1:70b up' }))
    expect(screen.getByText('Requests go to llama3.1:70b → GPT-4.1')).toBeVisible()
    expect(screen.getByText('Unsaved changes')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Save fallback' }))
    expect(await screen.findByText('The fallback order was saved')).toBeVisible()
    expect(await screen.findByText('Requests go to llama3.1:70b → GPT-4.1')).toBeVisible()
  })

  it('adds a model and discards the draft', async () => {
    const { user } = renderFallback()
    await user.click(await screen.findByRole('combobox', { name: 'Add a model' }))
    await user.click(await screen.findByRole('option', { name: /Claude Sonnet 4/ }))
    expect(
      screen.getByText('Requests go to GPT-4.1 → llama3.1:70b → Claude Sonnet 4'),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Discard' }))
    expect(screen.getByText('Requests go to GPT-4.1 → llama3.1:70b')).toBeVisible()
  })

  it('removes a model from the order', async () => {
    const { user } = renderFallback()
    await user.click(await screen.findByRole('button', { name: 'Remove GPT-4.1 from the order' }))
    expect(screen.getByText('Requests go to llama3.1:70b')).toBeVisible()
  })

  it('keeps "Private chats stay on local models" locked on', async () => {
    renderFallback()
    const lock = await screen.findByRole('switch', { name: 'Private chats stay on local models' })
    expect(lock).toBeChecked()
    expect(lock).toBeDisabled()
  })

  it('sets the timeout in seconds', async () => {
    const { user } = renderFallback()
    expect(await screen.findByLabelText('Seconds to wait')).toHaveValue('30')
    await user.click(screen.getByRole('switch', { name: 'When no answer starts in time' }))
    expect(screen.queryByLabelText('Seconds to wait')).not.toBeInTheDocument()
    expect(screen.getByText('Unsaved changes')).toBeVisible()
    await user.click(screen.getByRole('switch', { name: 'When no answer starts in time' }))
    expect(await screen.findByLabelText('Seconds to wait')).toBeVisible()
  })

  it('says there are no fallback models yet', async () => {
    useScenario('no-embedding')
    renderFallback()
    expect(await screen.findByText('No fallback models yet.')).toBeVisible()
    expect(screen.getByText(/No fallback model is ready/)).toBeVisible()
  })
})
