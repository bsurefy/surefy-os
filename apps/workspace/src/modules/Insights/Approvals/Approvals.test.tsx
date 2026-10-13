// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import Approvals from './Approvals'
import { approvalsDomain, seedApprovalsMock } from '../../../../mock/handlers/approvals'

vi.mock('next/navigation', () => ({ useParams: () => ({ orgSlug: 'acme' }) }))

const server = setupTestServer(...approvalsDomain.handlers)

function renderApprovals(searchParams?: string) {
  return renderWithProviders(<Approvals />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs('admin')),
    searchParams,
  })
}

/** Forces a scenario on every mocked request of this test. */
function useScenario(scenario: string) {
  server.events.on('request:start', ({ request }) => {
    request.headers.set('x-mock-scenario', scenario)
  })
}

const rowOf = (table: HTMLElement, title: string) => {
  const row = within(table).getByText(title).closest('tr')
  if (!row) throw new Error(`no row for ${title}`)
  return row
}

beforeEach(() => {
  seedApprovalsMock()
})

afterEach(() => {
  server.events.removeAllListeners()
})

describe('Approvals', () => {
  it('lists what waits for a decision, oldest first, with amount, confidence and rule', async () => {
    renderApprovals()
    const table = await screen.findByRole('table', { name: 'Approvals' })
    await within(table).findByText('Refund order #1001')
    const rows = within(table).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Mark deal D-77 as lost')
    expect(rows[2]).toHaveTextContent('Refund order #1001')
    expect(rows[2]).toHaveTextContent('$42.00')
    expect(rows[2]).toHaveTextContent('91%')
    expect(rows[2]).toHaveTextContent('Refunds above $200 need approval')
    expect(rows[1]).toHaveTextContent('Past the target time')
  })

  it('shows items assigned to others read-only, with the assignee', async () => {
    renderApprovals()
    const table = await screen.findByRole('table', { name: 'Approvals' })
    await within(table).findByText('Refund order #1005')
    expect(rowOf(table, 'Refund order #1005')).toHaveTextContent('Assigned to Finance')
  })

  it('links each row to its approval', async () => {
    renderApprovals()
    const table = await screen.findByRole('table', { name: 'Approvals' })
    await within(table).findByText('Pay Northwind Ltd')
    const link = within(rowOf(table, 'Pay Northwind Ltd')).getByRole('link')
    expect(link.getAttribute('href')).toMatch(/\/insights\/approvals\/[0-9a-f-]{36}$/)
  })

  it('shows what was decided today, with the outcome and who decided', async () => {
    renderApprovals('?view=decided')
    const table = await screen.findByRole('table', { name: 'Approvals' })
    await within(table).findByText('Refund order #0990')
    expect(rowOf(table, 'Refund order #0990')).toHaveTextContent('Approved')
    expect(rowOf(table, 'Refund order #0990')).toHaveTextContent('Omar Haddad')
    expect(rowOf(table, 'Refund order #0991')).toHaveTextContent('Rejected')
    expect(rowOf(table, 'Mark deal D-12 as won')).toHaveTextContent('Timed out')
    expect(within(table).queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('says everything is decided when the queue is empty', async () => {
    useScenario('empty')
    renderApprovals()
    expect(await screen.findByText('All caught up')).toBeVisible()
    expect(screen.getByText('Nothing is waiting for your decision.')).toBeVisible()
  })

  it('narrows the queue with the filters in the URL and says when nothing matches', async () => {
    renderApprovals('?kind=bridge_install')
    const table = await screen.findByRole('table', { name: 'Approvals' })
    expect(await within(table).findByText('Install Calendar bridge')).toBeVisible()
    expect(within(table).queryByText('Refund order #1001')).not.toBeInTheDocument()
  })

  it('offers bulk decisions only for items of one rule inside the quick-approve limit', async () => {
    const { user } = renderApprovals()
    const table = await screen.findByRole('table', { name: 'Approvals' })
    await within(table).findByText('Refund order #1001')
    await user.click(within(rowOf(table, 'Refund order #1001')).getByRole('checkbox'))
    await user.click(within(rowOf(table, 'Refund order #1002')).getByRole('checkbox'))
    expect(screen.getByText('2 selected')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Approve 2' })).toBeEnabled()

    await user.click(within(rowOf(table, 'Pay Northwind Ltd')).getByRole('checkbox'))
    expect(screen.getByRole('button', { name: 'Approve 3' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reject 3' })).toBeDisabled()
    expect(
      screen.getByText(/Bulk decisions need items of the same rule within the quick-approve limit/),
    ).toBeVisible()
  })

  it('rejects the selected items with one reason', async () => {
    const { user } = renderApprovals()
    const table = await screen.findByRole('table', { name: 'Approvals' })
    await within(table).findByText('Refund order #1001')
    await user.click(within(rowOf(table, 'Refund order #1001')).getByRole('checkbox'))
    await user.click(within(rowOf(table, 'Refund order #1002')).getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Reject 2' }))

    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Reject' }))
    expect(await within(dialog).findByText('Choose a reason to reject')).toBeVisible()

    await user.click(within(dialog).getByRole('combobox', { name: 'Reason' }))
    await user.click(await screen.findByRole('option', { name: 'Wrong amount' }))
    await user.click(within(dialog).getByRole('button', { name: 'Reject' }))

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
    await waitFor(() => {
      expect(within(table).queryByText('Refund order #1001')).not.toBeInTheDocument()
    })
    expect(within(table).getByText('Pay Northwind Ltd')).toBeVisible()
  })
})
