// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import {
  BLOCKED_RULE_ID,
  guardDomain,
  LIMIT_RULE_ID,
  REFUND_RULE_ID,
  resetGuardMock,
} from '../../../../../mock/handlers/guard'
import { membersDomain } from '../../../../../mock/handlers/members'
import { teamsDomain } from '../../../../../mock/handlers/teams'
import Guardrails from '../Guardrails'

vi.mock('next/navigation', () => ({ useParams: () => ({ orgSlug: 'acme' }) }))

const server = setupTestServer(
  ...guardDomain.handlers,
  ...teamsDomain.handlers,
  ...membersDomain.handlers,
)

function renderSheet(rule: string, role: 'owner' | 'admin' | 'builder' = 'admin') {
  return renderWithProviders(<Guardrails />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs(role)),
    searchParams: `?rule=${rule}`,
  })
}

/** Forces a scenario on the requests of one method for the rest of the test. */
function useScenario(scenario: string, method: string) {
  server.events.on('request:start', ({ request }) => {
    if (request.method === method) request.headers.set('x-mock-scenario', scenario)
  })
}

const findSheet = (name: string | RegExp) => screen.findByRole('dialog', { name })

beforeEach(() => {
  resetGuardMock()
})

afterEach(() => {
  server.events.removeAllListeners()
})

describe('GuardrailSheet', () => {
  it('opens a rule from its row with its name, type and the action it covers', async () => {
    const { user } = renderSheet('')
    await user.click(await screen.findByRole('button', { name: 'Never delete customer records' }))
    const sheet = await findSheet('Never delete customer records')
    expect(await within(sheet).findByRole('textbox', { name: 'Action' })).toHaveValue(
      'crm.delete_customer',
    )
    expect(within(sheet).getByRole('textbox', { name: 'Name' })).toHaveValue(
      'Never delete customer records',
    )
    expect(within(sheet).getByRole('combobox', { name: 'Type' })).toBeDisabled()
  })

  it('saves a stricter change at once', async () => {
    const { user } = renderSheet(BLOCKED_RULE_ID)
    const sheet = await findSheet('Never delete customer records')
    const name = await within(sheet).findByRole('textbox', { name: 'Name' })
    await user.clear(name)
    await user.type(name, 'Never delete any customer record')
    await user.click(within(sheet).getByRole('button', { name: 'Save' }))
    expect(
      await screen.findByRole('dialog', { name: 'Never delete any customer record' }),
    ).toBeVisible()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('does not save a rule without a name', async () => {
    const { user } = renderSheet(BLOCKED_RULE_ID)
    const sheet = await findSheet('Never delete customer records')
    await user.clear(await within(sheet).findByRole('textbox', { name: 'Name' }))
    await user.click(within(sheet).getByRole('button', { name: 'Save' }))
    expect(await within(sheet).findByText('Enter a name')).toBeVisible()
  })

  it('says a name is taken, on the name', async () => {
    useScenario('name-taken', 'PATCH')
    const { user } = renderSheet(BLOCKED_RULE_ID)
    const sheet = await findSheet('Never delete customer records')
    const name = await within(sheet).findByRole('textbox', { name: 'Name' })
    await user.type(name, ' 2')
    await user.click(within(sheet).getByRole('button', { name: 'Save' }))
    expect(
      await within(sheet).findByText('Another rule already has this name. Choose a different one.'),
    ).toBeVisible()
    expect(within(sheet).getByRole('button', { name: "Couldn't save · Retry" })).toBeVisible()
  })

  it('asks for the impact and a reason before saving a limit that is raised', async () => {
    const { user } = renderSheet(LIMIT_RULE_ID)
    const sheet = await findSheet('Sales: no more than 50 emails a day')
    const perDay = await within(sheet).findByRole('textbox', { name: 'Actions per day' })
    expect(perDay).toHaveValue('50')
    await user.clear(perDay)
    await user.type(perDay, '80')
    await user.tab()
    await user.click(within(sheet).getByRole('button', { name: 'Save' }))
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Save changes to “Sales: no more than 50 emails a day”?',
    })
    expect(await within(dialog).findByText('Affects 1 agent')).toBeVisible()
    await user.type(within(dialog).getByLabelText('Reason'), 'Peak season')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
    expect(within(sheet).getByRole('textbox', { name: 'Actions per day' })).toHaveValue('80')
  })

  it('saves a lower limit without a reason', async () => {
    const { user } = renderSheet(LIMIT_RULE_ID)
    const sheet = await findSheet('Sales: no more than 50 emails a day')
    const perDay = await within(sheet).findByRole('textbox', { name: 'Actions per day' })
    await user.clear(perDay)
    await user.type(perDay, '20')
    await user.tab()
    await user.click(within(sheet).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(within(sheet).getByRole('textbox', { name: 'Actions per day' })).toHaveValue('20')
    })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('deletes a rule after naming the impact and asking for a reason', async () => {
    const { user } = renderSheet(BLOCKED_RULE_ID)
    const sheet = await findSheet('Never delete customer records')
    await user.click(await within(sheet).findByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Delete “Never delete customer records”?',
    })
    expect(await within(dialog).findByText('Affects 5 agents')).toBeVisible()
    await user.type(within(dialog).getByLabelText('Reason'), 'Replaced by a team rule')
    await user.click(within(dialog).getByRole('button', { name: 'Delete rule' }))
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Never delete customer records' }),
      ).not.toBeInTheDocument()
    })
  })
})

describe('adding a guardrail', () => {
  it('adds a blocked action, with a type picker and the action it covers', async () => {
    const { user } = renderSheet('new')
    const sheet = await findSheet('Add guardrail')
    await user.click(within(sheet).getByRole('combobox', { name: 'Type' }))
    await user.click(await screen.findByRole('option', { name: 'Blocked action' }))
    expect(within(sheet).getByText('The action is never allowed.')).toBeVisible()
    await user.type(within(sheet).getByRole('textbox', { name: 'Name' }), 'Never change prices')
    await user.type(within(sheet).getByRole('textbox', { name: 'Action' }), 'catalog.update_price')
    await user.click(within(sheet).getByRole('button', { name: 'Add guardrail' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Add guardrail' })).not.toBeInTheDocument()
    })
    expect(await screen.findByText('Never change prices')).toBeVisible()
  })

  it('asks for what the rule needs before adding it', async () => {
    const { user } = renderSheet('new')
    const sheet = await findSheet('Add guardrail')
    await user.click(within(sheet).getByRole('button', { name: 'Add guardrail' }))
    expect(await within(sheet).findByText('Enter a name')).toBeVisible()
    expect(within(sheet).getByText('Enter the action this rule covers')).toBeVisible()
  })

  it('adds a condition that narrows the rule', async () => {
    const { user } = renderSheet('new')
    const sheet = await findSheet('Add guardrail')
    await user.click(within(sheet).getByRole('button', { name: 'Add condition' }))
    expect(within(sheet).getByRole('textbox', { name: 'Field' })).toBeVisible()
    await user.click(within(sheet).getByRole('button', { name: 'Remove condition 1' }))
    expect(within(sheet).queryByRole('textbox', { name: 'Field' })).not.toBeInTheDocument()
  })

  it('shows that another rule already blocks the action, after adding a duplicate', async () => {
    const { user } = renderSheet('new')
    const sheet = await findSheet('Add guardrail')
    await user.click(within(sheet).getByRole('combobox', { name: 'Type' }))
    await user.click(await screen.findByRole('option', { name: 'Blocked action' }))
    await user.type(within(sheet).getByRole('textbox', { name: 'Name' }), 'No customer deletion')
    await user.type(within(sheet).getByRole('textbox', { name: 'Action' }), 'crm.delete_customer')
    await user.click(within(sheet).getByRole('button', { name: 'Add guardrail' }))
    expect(await screen.findByText('Another rule already blocks this action')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Open that rule' })).toBeVisible()
  })
})

describe('locked and read-only rules', () => {
  it('shows an Admin why a locked rule cannot change', async () => {
    renderSheet(REFUND_RULE_ID, 'admin')
    const sheet = await findSheet('Refunds above $200 need approval')
    expect(
      await within(sheet).findByText(/Locked by Omar Haddad · Required by finance\. Only Owners/),
    ).toBeVisible()
    expect(within(sheet).getByRole('textbox', { name: 'Name' })).toBeDisabled()
    expect(within(sheet).queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('lets an Owner unlock it', async () => {
    const { user } = renderSheet(REFUND_RULE_ID, 'owner')
    const sheet = await findSheet('Refunds above $200 need approval')
    expect(await within(sheet).findByRole('textbox', { name: 'Name' })).toBeEnabled()
    await user.click(within(sheet).getByRole('button', { name: 'Unlock' }))
    expect(await within(sheet).findByRole('button', { name: 'Lock' })).toBeVisible()
  })

  it('lets an Owner lock a rule with a reason', async () => {
    const { user } = renderSheet(BLOCKED_RULE_ID, 'owner')
    const sheet = await findSheet('Never delete customer records')
    await user.click(await within(sheet).findByRole('button', { name: 'Lock' }))
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Lock “Never delete customer records”?',
    })
    await user.type(within(dialog).getByLabelText('Reason'), 'Compliance')
    await user.click(within(dialog).getByRole('button', { name: 'Lock rule' }))
    expect(await within(sheet).findByRole('button', { name: 'Unlock' })).toBeVisible()
  })

  it('shows a Builder the rule without a way to change it', async () => {
    renderSheet(BLOCKED_RULE_ID, 'builder')
    const sheet = await findSheet('Never delete customer records')
    expect(await within(sheet).findByText('You can view this rule')).toBeVisible()
    expect(within(sheet).getByRole('textbox', { name: 'Name' })).toBeDisabled()
    expect(within(sheet).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it("opens an agent's rule read-only with a link to its Guard tab", async () => {
    const { user } = renderSheet('')
    await user.click(
      await screen.findByRole('button', { name: 'Support triage: ask before refunds' }),
    )
    const sheet = await findSheet('Support triage: ask before refunds')
    expect(within(sheet).getByText('This rule belongs to an agent')).toBeVisible()
    expect(within(sheet).getByRole('link', { name: "Open the agent's Guard tab" })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/acme\/agents\/.+\/guard$/),
    )
  })

  it('says when the rule no longer exists', async () => {
    renderSheet('00000000-0000-4000-8000-0000000000ff')
    expect(await screen.findByText('This guardrail no longer exists.')).toBeVisible()
  })
})
