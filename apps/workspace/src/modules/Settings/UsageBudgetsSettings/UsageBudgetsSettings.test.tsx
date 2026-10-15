// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import UsageBudgetsSettings from './UsageBudgetsSettings'
import { membersDomain, resetMembersMock } from '../../../../mock/handlers/members'
import {
  organizationsDomain,
  resetOrganizationsMock,
} from '../../../../mock/handlers/organizations'
import { resetTeamsMock, teamsDomain } from '../../../../mock/handlers/teams'
import { usageDomain } from '../../../../mock/handlers/usage'
import { resetBudgetsMock } from '../../../../mock/handlers/usage.budgets'

vi.mock('next/navigation', () => ({ useParams: () => ({ orgSlug: 'acme' }) }))

const server = setupTestServer(
  ...usageDomain.handlers,
  ...membersDomain.handlers,
  ...teamsDomain.handlers,
  ...organizationsDomain.handlers,
)

function renderBudgets(role: 'owner' | 'admin' | 'builder' = 'admin', searchParams?: string) {
  return renderWithProviders(<UsageBudgetsSettings />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs(role)),
    searchParams,
  })
}

/** Forces a scenario on every mocked budget request of this test. */
function useScenario(scenario: string, method?: string) {
  server.events.on('request:start', ({ request }) => {
    if (!new URL(request.url).pathname.includes('/budgets')) return
    if (method && request.method !== method) return
    request.headers.set('x-mock-scenario', scenario)
  })
}

const rowOf = async (table: HTMLElement, name: string) =>
  (await within(table).findByText(name)).closest('tr') as HTMLElement

beforeEach(() => {
  resetBudgetsMock()
  resetMembersMock()
  resetTeamsMock()
  resetOrganizationsMock()
})

afterEach(() => {
  // a scenario forced by `useScenario` ends with its test
  server.events.removeAllListeners()
})

describe('UsageBudgetsSettings', () => {
  it('shows the organization budget, what happens when it is reached and its alerts', async () => {
    renderBudgets()
    const heading = await screen.findByRole('heading', { name: 'Organization budget' })
    const section = heading.closest('section')
    if (!section) throw new Error('The organization budget is not a section')
    expect(await within(section).findByText('$1,240 of $2,000')).toBeVisible()
    expect(within(section).getByRole('meter', { name: '62% used' })).toBeVisible()
    expect(within(section).getByText('Switch to local models')).toBeVisible()
    expect(within(section).getByText('50%, 80%, 100%')).toBeVisible()
    expect(within(section).getByText('Feb 1')).toBeVisible()
  })

  it('lists team budgets with their spend, and says when one is reached', async () => {
    renderBudgets()
    const table = await screen.findByRole('table', { name: 'Team budgets' })
    const support = await rowOf(table, 'Support')
    expect(support).toHaveTextContent('$430 of $500')
    expect(support).toHaveTextContent('Pause cloud models')
    expect(support).toHaveTextContent('80% alert')
    const sales = await rowOf(table, 'Sales')
    expect(sales).toHaveTextContent('$310 of $300')
    expect(sales).toHaveTextContent('Reached · usage continues')
  })

  it('explains primary-team charging with someone in several teams and links to Members', async () => {
    renderBudgets()
    expect(
      await screen.findByText(
        'Ana Ruiz is in Support and Sales; usage counts toward Sales, the primary team.',
      ),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'Change primary teams in Members' })).toHaveAttribute(
      'href',
      '/acme/settings/members',
    )
  })

  it('lists personal limits with the team each person is charged to', async () => {
    renderBudgets()
    const table = await screen.findByRole('table', { name: 'Personal limits' })
    const omar = await rowOf(table, 'Omar Haddad')
    expect(omar).toHaveTextContent('Support')
    expect(omar).toHaveTextContent('$12 of $50')
    const ana = await rowOf(table, 'Ana Ruiz')
    expect(ana).toHaveTextContent('Sales')
    expect(ana).toHaveTextContent('Off')
  })

  it('searches the personal limits by name and offers to clear a search without results', async () => {
    renderBudgets('admin', '?q=nobody')
    expect(await screen.findByText('No one matches')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeVisible()
  })

  it('offers to set budgets when there are none', async () => {
    useScenario('empty')
    renderBudgets()
    expect(await screen.findByText(/No organization budget/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Set a budget' })).toBeVisible()
    expect(await screen.findByText('No team budgets')).toBeVisible()
    expect(await screen.findByText('No personal limits')).toBeVisible()
  })

  it('shows retryable errors when budgets cannot load', async () => {
    useScenario('error')
    renderBudgets()
    expect(await screen.findByText("Couldn't load the organization budget")).toBeVisible()
    expect(await screen.findByText("Couldn't load the team budgets")).toBeVisible()
    expect(screen.getAllByRole('button', { name: 'Try again' }).length).toBeGreaterThan(0)
  })

  it('is view only for people who cannot change budgets', async () => {
    renderBudgets('builder')
    expect(await screen.findByText('View only')).toBeVisible()
    await screen.findByRole('table', { name: 'Team budgets' })
    expect(screen.queryByRole('button', { name: 'Add team budget' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Actions for/ })).not.toBeInTheDocument()
  })

  describe('changing budgets', () => {
    it('adds a personal limit for a chosen person', async () => {
      const { user } = renderBudgets()
      await user.click(await screen.findByRole('button', { name: 'Add personal limit' }))
      const dialog = await screen.findByRole('dialog', { name: 'Add a personal limit' })
      await user.click(within(dialog).getByRole('combobox', { name: 'Person' }))
      await user.click(await screen.findByRole('option', { name: /Maya Okafor/ }))
      await user.type(within(dialog).getByLabelText('Monthly amount'), '150')
      await user.click(within(dialog).getByRole('radio', { name: /Pause cloud models/ }))
      await user.click(within(dialog).getByRole('button', { name: 'Add budget' }))
      const table = await screen.findByRole('table', { name: 'Personal limits' })
      const maya = await rowOf(table, 'Maya Okafor')
      expect(maya).toHaveTextContent('$96 of $150')
      expect(maya).toHaveTextContent('Pause cloud models')
    })

    it('needs a person and an amount', async () => {
      const { user } = renderBudgets()
      await user.click(await screen.findByRole('button', { name: 'Add personal limit' }))
      const dialog = await screen.findByRole('dialog', { name: 'Add a personal limit' })
      await user.click(within(dialog).getByRole('button', { name: 'Add budget' }))
      expect(await within(dialog).findAllByText('This field is required.')).toHaveLength(2)
    })

    it('keeps a team budget at or below the organization budget', async () => {
      const { user } = renderBudgets()
      const table = await screen.findByRole('table', { name: 'Team budgets' })
      await user.click(await within(table).findByRole('button', { name: 'Actions for Support' }))
      await user.click(await screen.findByRole('menuitem', { name: 'Edit' }))
      const dialog = await screen.findByRole('dialog', { name: 'Edit the Support budget' })
      expect(within(dialog).getByText('Up to $2,000, the organization budget.')).toBeVisible()
      const amount = within(dialog).getByLabelText('Monthly amount')
      await user.clear(amount)
      await user.type(amount, '2500')
      await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
      expect(
        await within(dialog).findByText("Can't be more than the organization budget ($2,000)."),
      ).toBeVisible()
    })

    it('shows the service refusing an amount above the organization budget on the amount', async () => {
      useScenario('exceeds-parent', 'PATCH')
      const { user } = renderBudgets()
      const table = await screen.findByRole('table', { name: 'Personal limits' })
      await user.click(
        await within(table).findByRole('button', { name: 'Actions for Omar Haddad' }),
      )
      await user.click(await screen.findByRole('menuitem', { name: 'Edit' }))
      const dialog = await screen.findByRole('dialog', { name: 'Edit the limit for Omar Haddad' })
      const amount = within(dialog).getByLabelText('Monthly amount')
      await user.clear(amount)
      await user.type(amount, '1500')
      await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
      expect(
        await within(dialog).findByText("Can't be more than the organization budget ($2,000)."),
      ).toBeVisible()
    })

    it("asks before lowering a budget below this month's spend (T2)", async () => {
      const { user } = renderBudgets()
      const table = await screen.findByRole('table', { name: 'Team budgets' })
      await user.click(await within(table).findByRole('button', { name: 'Actions for Support' }))
      await user.click(await screen.findByRole('menuitem', { name: 'Edit' }))
      const dialog = await screen.findByRole('dialog', { name: 'Edit the Support budget' })
      const amount = within(dialog).getByLabelText('Monthly amount')
      await user.clear(amount)
      await user.type(amount, '400')
      await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
      const confirm = await screen.findByRole('alertdialog', {
        name: "Lower the budget for Support below this month's spend?",
      })
      expect(
        within(confirm).getByText(
          'Support has used $430; cloud models stop for Support until next month.',
        ),
      ).toBeVisible()
      await user.click(within(confirm).getByRole('button', { name: 'Lower budget' }))
      const support = await rowOf(table, 'Support')
      await waitFor(() => {
        expect(support).toHaveTextContent('$430 of $400')
      })
      expect(support).toHaveTextContent('Reached · cloud models paused until Feb 1')
    })

    it('deletes a team budget after confirming (T2) and offers that team again', async () => {
      const { user } = renderBudgets()
      const table = await screen.findByRole('table', { name: 'Team budgets' })
      await user.click(await within(table).findByRole('button', { name: 'Actions for Sales' }))
      await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))
      const confirm = await screen.findByRole('alertdialog', { name: 'Delete the Sales budget?' })
      await user.click(within(confirm).getByRole('button', { name: 'Delete budget' }))
      await waitFor(() => {
        expect(within(table).queryByText('Sales')).not.toBeInTheDocument()
      })
      await user.click(screen.getByRole('button', { name: 'Add team budget' }))
      const dialog = await screen.findByRole('dialog', { name: 'Add a team budget' })
      await user.click(within(dialog).getByRole('combobox', { name: 'Team' }))
      expect(await screen.findByRole('option', { name: 'Sales' })).toBeVisible()
      expect(screen.queryByRole('option', { name: 'Support' })).not.toBeInTheDocument()
    })
  })
})
