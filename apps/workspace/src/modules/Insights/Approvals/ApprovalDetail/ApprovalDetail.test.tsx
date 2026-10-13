// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import ApprovalDetail from './ApprovalDetail'
import {
  approvalsDomain,
  BRIDGE_REQUEST_ID,
  FINANCE_ONLY_ID,
  PAYMENT_LARGE_ID,
  REFUND_SMALL_ID,
  seedApprovalsMock,
} from '../../../../../mock/handlers/approvals'

const route = vi.hoisted(() => ({ approvalId: '' }))
vi.mock('next/navigation', () => ({
  useParams: () => ({ orgSlug: 'acme', approvalId: route.approvalId }),
}))

const server = setupTestServer(...approvalsDomain.handlers)

function renderDetail(approvalId: string) {
  route.approvalId = approvalId
  return renderWithProviders(<ApprovalDetail />, {
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

beforeEach(() => {
  seedApprovalsMock()
})

afterEach(() => {
  server.events.removeAllListeners()
})

describe('ApprovalDetail', () => {
  it('shows what will happen, why the AI suggests it and the rule', async () => {
    renderDetail(REFUND_SMALL_ID)
    expect(await screen.findByRole('heading', { name: 'Refund order #1001' })).toBeVisible()
    expect(screen.getByText('payments.refund')).toBeVisible()
    expect(screen.getByText('Lost parcel')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Why the AI suggests this' })).toBeVisible()
    expect(screen.getByText(/the carrier confirmed it/)).toBeVisible()
    expect(screen.getByText('Refund policy')).toBeVisible()
    expect(screen.getByText('Refunds above $200 need approval')).toBeVisible()
    expect(screen.getByText('Waiting')).toBeVisible()
  })

  it('approves and shows the result', async () => {
    const { user } = renderDetail(REFUND_SMALL_ID)
    await user.click(await screen.findByRole('button', { name: 'Approve' }))
    expect(await screen.findByText(/^Decided /)).toBeVisible()
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
    })
  })

  it('edits the fields before approving and keeps what the AI proposed beside them', async () => {
    const { user } = renderDetail(REFUND_SMALL_ID)
    await user.click(await screen.findByRole('button', { name: 'Edit and approve' }))
    const amount = screen.getByRole('textbox', { name: 'Amount' })
    await user.clear(amount)
    await user.type(amount, '30')
    expect(screen.getByText('Was 42')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Approve with edits' }))
    expect(await screen.findByText('Approved with your edits')).toBeVisible()
    expect(screen.getByText('Was 42')).toBeVisible()
    expect(screen.getByText('30')).toBeVisible()
  })

  it('stops an edit that is not valid and records nothing', async () => {
    const { user } = renderDetail(REFUND_SMALL_ID)
    await user.click(await screen.findByRole('button', { name: 'Edit and approve' }))
    const amount = screen.getByRole('textbox', { name: 'Amount' })
    await user.clear(amount)
    await user.type(amount, 'lots')
    await user.click(screen.getByRole('button', { name: 'Approve with edits' }))
    expect(await screen.findByText('Enter a number of 0 or more')).toBeVisible()
    expect(screen.getByText('Check the fields marked below')).toBeVisible()
    expect(screen.getByText('Waiting')).toBeVisible()
  })

  it('shows the field errors the API finds in the edited fields', async () => {
    useScenario('edit-invalid')
    const { user } = renderDetail(REFUND_SMALL_ID)
    await user.click(await screen.findByRole('button', { name: 'Edit and approve' }))
    const amount = screen.getByRole('textbox', { name: 'Amount' })
    await user.clear(amount)
    await user.type(amount, '30')
    await user.click(screen.getByRole('button', { name: 'Approve with edits' }))
    expect(await screen.findByText('Enter an amount above 0')).toBeVisible()
  })

  it('rejects with a reason, and Other needs a note', async () => {
    const { user } = renderDetail(REFUND_SMALL_ID)
    await user.click(await screen.findByRole('button', { name: 'Reject' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('combobox', { name: 'Reason' }))
    await user.click(await screen.findByRole('option', { name: 'Other' }))
    await user.click(within(dialog).getByRole('button', { name: 'Reject' }))
    expect(await within(dialog).findByText('Add a note so others know why')).toBeVisible()

    await user.type(within(dialog).getByRole('textbox', { name: /Note/ }), 'Duplicate request')
    await user.click(within(dialog).getByRole('button', { name: 'Reject' }))
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
    expect(screen.getByText(/Reason: Other · Duplicate request/)).toBeVisible()
  })

  it('says who decided first and takes the actions away', async () => {
    useScenario('already-decided')
    const { user } = renderDetail(REFUND_SMALL_ID)
    await user.click(await screen.findByRole('button', { name: 'Approve' }))
    expect(await screen.findByText('Omar Haddad already approved this')).toBeVisible()
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
    })
  })

  it('shows a timed-out approval with what the timeout did', async () => {
    useScenario('expired')
    const { user } = renderDetail(REFUND_SMALL_ID)
    await user.click(await screen.findByRole('button', { name: 'Approve' }))
    expect(await screen.findByText(/Timed out at .* · It is rejected/)).toBeVisible()
  })

  it('records nothing when the person has to confirm it is them', async () => {
    useScenario('session-not-fresh')
    const { user } = renderDetail(PAYMENT_LARGE_ID)
    expect(
      await screen.findByText(/you'll be asked to confirm it's you before it's approved/),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled()
    })
    expect(screen.getByText('Waiting')).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('is read-only for an item assigned to someone else', async () => {
    renderDetail(FINANCE_ONLY_ID)
    expect(await screen.findByText(/Assigned to Finance\. You can read it/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument()
  })

  it('shows the access a bridge asks for, without editable fields', async () => {
    renderDetail(BRIDGE_REQUEST_ID)
    expect(await screen.findByText('calendar.write')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Edit and approve' })).not.toBeInTheDocument()
  })

  it('says when the approval is not available', async () => {
    renderDetail('00000000-0000-4000-8000-00000000dead')
    expect(await screen.findByText("This approval isn't available")).toBeVisible()
  })
})
