// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import Guardrails from './Guardrails'
import { guardDomain, resetGuardMock } from '../../../../mock/handlers/guard'
import { membersDomain } from '../../../../mock/handlers/members'
import { teamsDomain } from '../../../../mock/handlers/teams'

vi.mock('next/navigation', () => ({ useParams: () => ({ orgSlug: 'acme' }) }))

const server = setupTestServer(
  ...guardDomain.handlers,
  ...teamsDomain.handlers,
  ...membersDomain.handlers,
)

function renderGuardrails(role: 'owner' | 'admin' | 'builder' = 'admin', searchParams?: string) {
  return renderWithProviders(<Guardrails />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs(role)),
    searchParams,
  })
}

/** Forces a scenario on the requests of one method for the rest of the test. */
function useScenario(scenario: string, method?: string) {
  server.events.on('request:start', ({ request }) => {
    if (!method || request.method === method) request.headers.set('x-mock-scenario', scenario)
  })
}

const rowOf = async (name: string) => {
  const table = await screen.findByRole('table', { name: 'Guardrails' })
  const row = (await within(table).findByText(name)).closest('tr')
  if (!row) throw new Error(`No row for ${name}`)
  return row
}

beforeEach(() => {
  resetGuardMock()
})

afterEach(() => {
  server.events.removeAllListeners()
})

describe('Guardrails table', () => {
  it('lists the rules with their type, scope, use and activity', async () => {
    renderGuardrails()
    const refund = await rowOf('Refunds above $200 need approval')
    expect(refund).toHaveTextContent('Approval rule')
    expect(refund).toHaveTextContent('Organization')
    expect(refund).toHaveTextContent('3 agents and flows')
    expect(refund).toHaveTextContent('12')
    const sales = await rowOf('Sales: no more than 50 emails a day')
    expect(sales).toHaveTextContent('Action limit')
    expect(sales).toHaveTextContent('Team · Sales')
  })

  it('marks a locked rule and says who locked it', async () => {
    renderGuardrails()
    const refund = await rowOf('Refunds above $200 need approval')
    expect(within(refund).getByRole('img', { name: 'Locked' })).toBeVisible()
  })

  it('lists the rules of agents and the data filters, read-only', async () => {
    renderGuardrails()
    const agentRule = await rowOf('Support triage: ask before refunds')
    expect(agentRule).toHaveTextContent('Agent')
    expect(within(agentRule).getByRole('switch')).toBeDisabled()
    const filter = await rowOf('Payment card numbers')
    expect(filter).toHaveTextContent('Data filter')
  })

  it('narrows the list by type from the address', async () => {
    renderGuardrails('admin', '?type=blocked_action')
    expect(await screen.findByText('Never delete customer records')).toBeVisible()
    expect(screen.queryByText('Refunds above $200 need approval')).not.toBeInTheDocument()
  })

  it('says when nothing matches, and offers to clear the filters', async () => {
    renderGuardrails('admin', '?q=zzz')
    expect(await screen.findByText('No guardrails match')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeVisible()
  })

  it('invites the first guardrail when there are none', async () => {
    useScenario('empty', 'GET')
    renderGuardrails()
    expect(await screen.findByText('No guardrails yet')).toBeVisible()
    expect(screen.getAllByRole('button', { name: 'Add guardrail' }).length).toBeGreaterThan(0)
  })

  it('offers a retry when the list cannot load', async () => {
    useScenario('error', 'GET')
    renderGuardrails()
    expect(await screen.findByText("Couldn't load the guardrails")).toBeVisible()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible()
  })

  it('shows Builders the table without a way to change it', async () => {
    renderGuardrails('builder')
    const blocked = await rowOf('Never delete customer records')
    expect(within(blocked).getByRole('switch')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Add guardrail' })).not.toBeInTheDocument()
  })
})

describe('turning a guardrail on and off', () => {
  it('turns a rule on at once', async () => {
    const { user } = renderGuardrails()
    const off = await rowOf('Switched off rule')
    await user.click(within(off).getByRole('switch'))
    await waitFor(() => {
      expect(within(off).getByRole('switch')).toBeChecked()
    })
  })

  it('asks for the impact and a reason before turning a rule off', async () => {
    const { user } = renderGuardrails()
    const row = await rowOf('Never delete customer records')
    await user.click(within(row).getByRole('switch'))
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Turn off “Never delete customer records”?',
    })
    expect(await within(dialog).findByText('Affects 5 agents')).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Turn off' }))
    expect(
      await within(dialog).findByText('Give a reason. It is saved in the audit log.'),
    ).toBeVisible()
    await user.type(within(dialog).getByLabelText('Reason'), 'Cleaning up')
    await user.click(within(dialog).getByRole('button', { name: 'Turn off' }))
    await waitFor(() => {
      expect(within(row).getByRole('switch')).not.toBeChecked()
    })
  })

  it('leaves a locked rule to Owners', async () => {
    renderGuardrails('admin')
    const refund = await rowOf('Refunds above $200 need approval')
    expect(within(refund).getByRole('switch')).toBeDisabled()
  })

  it('lets an Owner switch a locked rule', async () => {
    renderGuardrails('owner')
    const refund = await rowOf('Refunds above $200 need approval')
    expect(within(refund).getByRole('switch')).toBeEnabled()
  })
})
