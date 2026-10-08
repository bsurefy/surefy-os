// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import GuardDefaults from './GuardDefaults'
import { guardDomain, resetGuardMock } from '../../../../mock/handlers/guard'

vi.mock('next/navigation', () => ({ useParams: () => ({ orgSlug: 'acme' }) }))

const server = setupTestServer(...guardDomain.handlers)

function renderDefaults(role: 'owner' | 'admin' | 'builder' = 'admin') {
  return renderWithProviders(<GuardDefaults />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs(role)),
  })
}

/** Forces a scenario on the requests of one method for the rest of the test. */
function useScenario(scenario: string, method?: string) {
  server.events.on('request:start', ({ request }) => {
    if (!method || request.method === method) request.headers.set('x-mock-scenario', scenario)
  })
}

/** Types a threshold into the number next to its slider and leaves the field. */
async function setNumber(name: string, value: string) {
  const input = await screen.findByRole('textbox', { name })
  await userEvent.clear(input)
  await userEvent.type(input, value)
  await userEvent.tab()
}

beforeEach(() => {
  resetGuardMock()
})

afterEach(() => {
  server.events.removeAllListeners()
})

describe('GuardDefaults', () => {
  it('shows the standard thresholds, the bands they make and the impact on recent actions', async () => {
    renderDefaults()
    expect(await screen.findByRole('textbox', { name: 'Automatic' })).toHaveValue('90')
    expect(screen.getByRole('textbox', { name: 'AI double-check' })).toHaveValue('60')
    expect(
      screen.getByText(
        'Automatic at 90% and above · AI double-check 60–89% · Needs a person below 60%',
      ),
    ).toBeVisible()
    expect(
      await screen.findByText(
        /With these values, \d+ of the last 1,000 actions would have needed a person\./,
      ),
    ).toBeVisible()
  })

  it('updates the impact preview when a threshold changes', async () => {
    renderDefaults()
    const first = await screen.findByText(/would have needed a person/)
    const before = first.textContent
    await setNumber('AI double-check', '80')
    await waitFor(() => {
      expect(screen.getByText(/would have needed a person/).textContent).not.toBe(before)
    })
  })

  it('shows the approval settings with the standard values', async () => {
    renderDefaults()
    expect(await screen.findByRole('textbox', { name: 'Largest amount' })).toHaveValue('0')
    expect(screen.getByRole('radio', { name: 'Low risk only' })).toBeChecked()
    expect(screen.getByRole('switch', { name: /confirm it is them/ })).not.toBeChecked()
    expect(screen.getByRole('textbox', { name: 'Time' })).toHaveValue('1')
  })

  it('saves a stricter value after a confirmation that needs no reason', async () => {
    renderDefaults()
    await setNumber('Automatic', '95')
    expect(await screen.findByText('1 unsaved change')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Save the Guard defaults?' })
    expect(
      within(dialog).getByText('Applies to all agents and flows that use defaults.'),
    ).toBeVisible()
    expect(within(dialog).queryByLabelText('Reason')).not.toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save defaults' }))
    expect(await screen.findByText('Guard defaults saved')).toBeVisible()
    await waitFor(() => {
      expect(screen.queryByText('1 unsaved change')).not.toBeInTheDocument()
    })
    expect(screen.getByRole('textbox', { name: 'Automatic' })).toHaveValue('95')
  })

  it('names what gets looser and asks for a reason before saving it', async () => {
    renderDefaults()
    await setNumber('Automatic', '80')
    await userEvent.click(await screen.findByRole('button', { name: 'Save' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('The automatic threshold goes from 90% to 80%.')).toBeVisible()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save defaults' }))
    expect(await within(dialog).findByText('Give a reason for loosening Guard.')).toBeVisible()
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'Too many approvals')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save defaults' }))
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
    expect(screen.getByRole('textbox', { name: 'Automatic' })).toHaveValue('80')
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('does not save a double-check threshold at or above the automatic one', async () => {
    renderDefaults()
    await setNumber('AI double-check', '95')
    await userEvent.click(await screen.findByRole('button', { name: 'Save' }))
    expect(
      await screen.findAllByText(
        'The double-check threshold must be lower than the automatic one.',
      ),
    ).not.toHaveLength(0)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('keeps the changes and offers Retry when the save fails', async () => {
    useScenario('error', 'PUT')
    renderDefaults()
    await setNumber('Automatic', '95')
    await userEvent.click(await screen.findByRole('button', { name: 'Save' }))
    const dialog = await screen.findByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save defaults' }))
    expect(await within(dialog).findByRole('alert')).toBeVisible()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByText("Couldn't save the changes")).toBeVisible()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Automatic' })).toHaveValue('95')
  })

  it('discards the changes', async () => {
    renderDefaults()
    await setNumber('Automatic', '95')
    await userEvent.click(await screen.findByRole('button', { name: 'Discard' }))
    expect(screen.getByRole('textbox', { name: 'Automatic' })).toHaveValue('90')
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('shows Builders the values without a way to change them', async () => {
    renderDefaults('builder')
    expect(await screen.findByText('You can view these values')).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Automatic' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('offers a retry when the defaults cannot load', async () => {
    useScenario('error', 'GET')
    renderDefaults()
    expect(await screen.findByText("Couldn't load the Guard defaults")).toBeVisible()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible()
  })
})
