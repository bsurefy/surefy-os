// SPDX-License-Identifier: AGPL-3.0-only
import { act, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { appMessages } from '@/test/messages'
import { ORG_ID } from '@/test/shell'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import SetupChecklist from './SetupChecklist'
import {
  resetSetupChecklistMock,
  setupChecklistDomain,
} from '../../../../mock/handlers/setupChecklist'

const server = setupTestServer(...setupChecklistDomain.handlers)

/** Forces a scenario on every mocked request of this test. */
function useScenario(scenario: string) {
  server.events.on('request:start', ({ request }) => {
    request.headers.set('x-mock-scenario', scenario)
  })
}

const CHECKLIST = { name: 'Finish setting up' }
const RENDER_TICK_MS = 50

/** Renders, then waits until the checklist's answer has arrived and been drawn. */
async function renderSettled() {
  const answered = new Promise<void>((resolve) => {
    server.events.on('response:mocked', ({ request }) => {
      if (request.url.includes('/setup/checklist')) resolve()
    })
  })
  const view = renderChecklist()
  await answered
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, RENDER_TICK_MS))
  })
  return view
}

function renderChecklist() {
  return renderWithProviders(<SetupChecklist orgSlug="acme" />, {
    orgId: ORG_ID,
    messages: appMessages,
  })
}

beforeEach(() => {
  resetSetupChecklistMock()
})

afterEach(() => {
  server.events.removeAllListeners()
})

describe('SetupChecklist', () => {
  it('lists the items with what is done and where to do the rest', async () => {
    renderChecklist()
    const checklist = await screen.findByRole('region', CHECKLIST)
    expect(within(checklist).getByText('1 of 3 done')).toBeVisible()
    expect(within(checklist).getByText(/Connect a model/)).toHaveTextContent('Done')
    expect(within(checklist).getByRole('link', { name: 'Open Knowledge' })).toHaveAttribute(
      'href',
      '/acme/knowledge',
    )
    expect(within(checklist).getByRole('link', { name: 'Invite people' })).toHaveAttribute(
      'href',
      '/acme/settings/members',
    )
    expect(within(checklist).queryByRole('link', { name: 'Open Vault' })).not.toBeInTheDocument()
  })

  it('hides once the member dismisses it', async () => {
    const { user } = renderChecklist()
    await user.click(await screen.findByRole('button', { name: 'Dismiss checklist' }))
    await waitFor(() => {
      expect(screen.queryByRole('region', CHECKLIST)).not.toBeInTheDocument()
    })
    expect(await screen.findByText('Checklist hidden. It stays out of your way.')).toBeVisible()
  })

  it.each([
    ['dismissed', 'was dismissed earlier'],
    ['finished', 'everything is done'],
    ['empty', 'no item applies yet'],
  ])('is not shown when the scenario is %s (%s)', async (scenario) => {
    useScenario(scenario)
    await renderSettled()
    expect(screen.queryByRole('region', CHECKLIST)).not.toBeInTheDocument()
  })
})
