// SPDX-License-Identifier: AGPL-3.0-only
import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import ModelSelector from './ModelSelector'
import { modelsDomain, resetModelsMock } from '../../../../mock/handlers/models'

vi.mock('next/navigation', () => ({ useParams: () => ({ orgSlug: 'acme' }) }))

const server = setupTestServer(...modelsDomain.handlers)

function renderSelector(
  props: Partial<React.ComponentProps<typeof ModelSelector>> = {},
  role: 'admin' | 'user' = 'admin',
) {
  const onValueChange = vi.fn()
  const result = renderWithProviders(
    <ModelSelector value={null} onValueChange={onValueChange} {...props} />,
    {
      orgId: ORG_ID,
      messages: appMessages,
      queryClient: seededShellClient(accessAs(role)),
    },
  )
  return { ...result, onValueChange }
}

/** The list item that shows `text`. */
function getItem(root: HTMLElement, text: string): HTMLElement {
  const found = within(root).getByText(text).closest<HTMLElement>('[cmdk-item]')
  if (!found) throw new Error(`No list item shows ${text}`)
  return found
}

afterEach(() => {
  server.events.removeAllListeners()
})

beforeEach(() => {
  resetModelsMock()
})

describe('ModelSelector', () => {
  it('groups models by where they run and says where the data goes', async () => {
    const { user } = renderSelector()
    await user.click(screen.getByRole('button', { name: 'Model' }))
    const list = await screen.findByRole('listbox')
    expect(await within(list).findByText('On your server')).toBeVisible()
    expect(within(list).getByText('Your API keys')).toBeVisible()
    expect(getItem(list, 'llama3.1:70b')).toHaveTextContent('Stays on your server')
    expect(getItem(list, 'GPT-4.1')).toHaveTextContent('Sent to OpenAI')
    expect(within(list).queryByText('nomic-embed-text')).not.toBeInTheDocument()
  })

  it('reports the chosen model key and shows its name', async () => {
    const { user, onValueChange } = renderSelector()
    await user.click(screen.getByRole('button', { name: 'Model' }))
    await user.click(await screen.findByRole('option', { name: /GPT-4\.1 mini/ }))
    expect(onValueChange).toHaveBeenCalledWith('openai/gpt-4.1-mini')
  })

  it('shows the chosen model on the button', async () => {
    renderSelector({ value: 'openai/gpt-4.1' })
    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: 'Model' })).toHaveTextContent('GPT-4.1')
    })
  })

  it("disables models that can't read images when the message has images", async () => {
    const { user } = renderSelector({ requiresVision: true })
    await user.click(screen.getByRole('button', { name: 'Model' }))
    const llama = (await screen.findByText('llama3.1:70b')).closest('[cmdk-item]')
    expect(llama).toHaveAttribute('aria-disabled', 'true')
    expect(llama).toHaveTextContent("Can't read images")
    expect(screen.getByText('GPT-4.1').closest('[cmdk-item]')).not.toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('sends an Admin to Vault when there are no models', async () => {
    server.events.on('request:start', ({ request }) => {
      request.headers.set('x-mock-scenario', 'empty')
    })
    const { user } = renderSelector()
    await user.click(screen.getByRole('button', { name: 'Model' }))
    expect(await screen.findByText('Connect a model to start chatting.')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Open Vault' })).toHaveAttribute(
      'href',
      '/acme/settings/vault',
    )
  })

  it('asks everyone else to ask an Admin when there are no models', async () => {
    server.events.on('request:start', ({ request }) => {
      request.headers.set('x-mock-scenario', 'empty')
    })
    const { user } = renderSelector({}, 'user')
    await user.click(screen.getByRole('button', { name: 'Model' }))
    expect(await screen.findByText(/Your admin hasn't enabled any models yet/)).toBeVisible()
    expect(screen.queryByRole('link', { name: 'Open Vault' })).not.toBeInTheDocument()
  })
})
