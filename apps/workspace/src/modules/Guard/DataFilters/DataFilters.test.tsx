// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import DataFilters from './DataFilters'
import { guardDomain, resetGuardMock } from '../../../../mock/handlers/guard'
import { teamsDomain } from '../../../../mock/handlers/teams'

vi.mock('next/navigation', () => ({ useParams: () => ({ orgSlug: 'acme' }) }))

const server = setupTestServer(...guardDomain.handlers, ...teamsDomain.handlers)

function renderFilters(role: 'owner' | 'admin' | 'builder' = 'admin') {
  return renderWithProviders(<DataFilters />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs(role)),
  })
}

/** Forces a scenario on the requests of one method for the rest of the test. */
function useScenario(scenario: string, method: string) {
  server.events.on('request:start', ({ request }) => {
    if (request.method === method) request.headers.set('x-mock-scenario', scenario)
  })
}

const actionOf = async (type: string) =>
  within(await screen.findByRole('radiogroup', { name: `Action for ${type}` }))

beforeEach(() => {
  resetGuardMock()
})

afterEach(() => {
  server.events.removeAllListeners()
})

describe('DataFilters types', () => {
  it('lists every personal-data type with its action, and marks the standard ones', async () => {
    renderFilters()
    expect((await actionOf('Email addresses')).getByRole('radio', { name: 'Mask' })).toBeChecked()
    expect((await actionOf('Names')).getByRole('radio', { name: 'Detect' })).toBeChecked()
    expect(
      (await actionOf('Payment card numbers')).getByRole('radio', { name: 'Block' }),
    ).toBeChecked()
    expect(screen.getAllByText('Standard').length).toBeGreaterThan(0)
  })

  it('shows the exceptions of a type, and the custom patterns', async () => {
    renderFilters()
    expect(await screen.findByText('Team: Support · Detect')).toBeVisible()
    expect(screen.getByText('Customer number')).toBeVisible()
    expect(screen.getByText('CUS-\\d{6}')).toBeVisible()
  })

  it('says local models skip the filter', async () => {
    renderFilters()
    expect(await screen.findByText('Local models skip the filter')).toBeVisible()
  })

  it('offers a retry when the filters cannot load', async () => {
    useScenario('error', 'GET')
    renderFilters()
    expect(await screen.findByText("Couldn't load the data filters")).toBeVisible()
  })

  it('shows Builders the filters without a way to change them', async () => {
    renderFilters('builder')
    expect((await actionOf('Email addresses')).getByRole('radio', { name: 'Block' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Add custom type' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add exception/ })).not.toBeInTheDocument()
  })
})

describe('changing an action', () => {
  it('saves a stricter action at once', async () => {
    const { user } = renderFilters()
    await user.click((await actionOf('Email addresses')).getByRole('radio', { name: 'Block' }))
    await waitFor(async () => {
      expect(
        (await actionOf('Email addresses')).getByRole('radio', { name: 'Block' }),
      ).toBeChecked()
    })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('asks for a reason before loosening a type', async () => {
    const { user } = renderFilters()
    await user.click((await actionOf('Payment card numbers')).getByRole('radio', { name: 'Mask' }))
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Loosen the filter for Payment card numbers?',
    })
    expect(within(dialog).getByText('Payment card numbers goes from Block to Mask.')).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Loosen filter' }))
    expect(
      await within(dialog).findByText('Give a reason. It is saved in the audit log.'),
    ).toBeVisible()
    await user.type(within(dialog).getByLabelText('Reason'), 'Card numbers are tokenised')
    await user.click(within(dialog).getByRole('button', { name: 'Loosen filter' }))
    await waitFor(async () => {
      expect(
        (await actionOf('Payment card numbers')).getByRole('radio', { name: 'Mask' }),
      ).toBeChecked()
    })
  })
})

describe('exceptions', () => {
  it('adds an exception for a team, with a reason', async () => {
    const { user } = renderFilters()
    await user.click(
      await screen.findByRole('button', { name: 'Add an exception for Phone numbers' }),
    )
    const dialog = await screen.findByRole('dialog', { name: 'Add an exception for Phone numbers' })
    await user.click(within(dialog).getByRole('combobox', { name: 'Team' }))
    await user.click(await screen.findByRole('option', { name: 'Sales' }))
    await user.click(within(dialog).getByRole('radio', { name: 'Detect' }))
    await user.click(within(dialog).getByRole('button', { name: 'Add exception' }))
    expect(
      await within(dialog).findByText('Give a reason. It is saved in the audit log.'),
    ).toBeVisible()
    await user.type(within(dialog).getByLabelText('Reason'), 'Sales calls need numbers')
    await user.click(within(dialog).getByRole('button', { name: 'Add exception' }))
    expect(await screen.findByText('Team: Sales · Detect')).toBeVisible()
  })

  it('removes an exception that was looser than the organization at once', async () => {
    const { user } = renderFilters()
    await user.click(
      await screen.findByRole('button', { name: 'Remove the exception for Support' }),
    )
    await waitFor(() => {
      expect(screen.queryByText('Team: Support · Detect')).not.toBeInTheDocument()
    })
  })
})

describe('custom types', () => {
  it('adds a custom type', async () => {
    const { user } = renderFilters()
    await user.click(await screen.findByRole('button', { name: 'Add custom type' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add a custom type' })
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Order number')
    await user.click(within(dialog).getByRole('textbox', { name: 'Pattern' }))
    await user.paste('ORD-[0-9]{8}')
    await user.click(within(dialog).getByRole('button', { name: 'Add type' }))
    expect(await screen.findByText('Order number')).toBeVisible()
  })

  it('asks for a name and a pattern', async () => {
    const { user } = renderFilters()
    await user.click(await screen.findByRole('button', { name: 'Add custom type' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add a custom type' })
    await user.click(within(dialog).getByRole('button', { name: 'Add type' }))
    expect(await within(dialog).findByText('Enter a name')).toBeVisible()
    expect(within(dialog).getByText('Enter a pattern')).toBeVisible()
  })

  it('says a pattern is refused, on the pattern', async () => {
    useScenario('pattern-invalid', 'POST')
    const { user } = renderFilters()
    await user.click(await screen.findByRole('button', { name: 'Add custom type' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add a custom type' })
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Bad')
    await user.type(within(dialog).getByRole('textbox', { name: 'Pattern' }), '(a+)+')
    await user.click(within(dialog).getByRole('button', { name: 'Add type' }))
    expect(
      await within(dialog).findByText(
        /too long, isn't a valid expression, or could run too slowly/,
      ),
    ).toBeVisible()
  })

  it('deletes a custom type after asking for a reason', async () => {
    const { user } = renderFilters()
    await user.click(await screen.findByRole('button', { name: 'Delete Customer number' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete “Customer number”?' })
    await user.type(within(dialog).getByLabelText('Reason'), 'Not used any more')
    await user.click(within(dialog).getByRole('button', { name: 'Delete type' }))
    await waitFor(() => {
      expect(screen.queryByText('Customer number')).not.toBeInTheDocument()
    })
  })
})

describe('Try it', () => {
  it('masks what the filters mask and lists what it found', async () => {
    renderFilters()
    const masked = await screen.findByLabelText('What leaves')
    await waitFor(() => {
      expect(masked).toHaveTextContent('[EMAIL]')
    })
    expect(masked).toHaveTextContent('[PHONE]')
    expect(masked).not.toHaveTextContent('maria@example.com')
    expect(screen.getByText('Email addresses: 1 match · Mask')).toBeVisible()
  })

  it('warns that a real request would be stopped when a type is set to block', async () => {
    renderFilters()
    expect(await screen.findByText('A real request would be stopped')).toBeVisible()
  })

  it('follows a change of action', async () => {
    const { user } = renderFilters()
    const masked = await screen.findByLabelText('What leaves')
    await waitFor(() => {
      expect(masked).toHaveTextContent('[EMAIL]')
    })
    await user.click((await actionOf('Email addresses')).getByRole('radio', { name: 'Detect' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.type(within(dialog).getByLabelText('Reason'), 'Test')
    await user.click(within(dialog).getByRole('button', { name: 'Loosen filter' }))
    await waitFor(() => {
      expect(screen.getByLabelText('What leaves')).toHaveTextContent('maria@example.com')
    })
  })

  it('asks for some text when the box is empty', async () => {
    const { user } = renderFilters()
    const text = await screen.findByRole('textbox', { name: 'Sample text' })
    await user.clear(text)
    expect(await screen.findByText('Enter some text to see the result.')).toBeVisible()
  })
})
