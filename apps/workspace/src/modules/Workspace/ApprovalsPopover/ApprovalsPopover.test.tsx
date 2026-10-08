// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import { http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, ORG_SLUG, seededShellClient } from '@/test/shell'
import type * as FeedbackModule from '@surefy/ui/components/Feedback'
import { mockPath, renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import ApprovalsPopover from './ApprovalsPopover'
import { approvalsDomain, seedApprovalsMock } from '../../../../mock/handlers/approvals'

const toast = vi.hoisted(() => ({
  undo: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))
vi.mock('@surefy/ui/components/Feedback', async (importOriginal) => {
  const original = await importOriginal<typeof FeedbackModule>()
  return { ...original, toast }
})

const server = setupTestServer(...approvalsDomain.handlers)

function renderPopover(access = accessAs('admin')) {
  return renderWithProviders(<ApprovalsPopover orgSlug={ORG_SLUG} />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(access),
  })
}

/** The options of the Undo toast the last Approve opened. */
function lastUndo() {
  const call = toast.undo.mock.calls.at(-1)
  if (!call) throw new Error('no Undo toast was shown')
  return {
    message: call[0] as string,
    options: call[1] as { onUndo: () => void; onCommit: () => void },
  }
}

beforeEach(() => {
  seedApprovalsMock()
  toast.undo.mockClear()
  toast.success.mockClear()
  toast.error.mockClear()
})

afterEach(() => {
  server.resetHandlers()
})

describe('ApprovalsPopover', () => {
  it('names the count of items the person can decide', async () => {
    renderPopover()
    expect(
      await screen.findByRole('button', { name: 'Approvals, 6 waiting for you' }),
    ).toBeVisible()
  })

  it('is not there without the Guard module', () => {
    renderPopover(accessAs('admin', { modules: [] }))
    expect(screen.queryByRole('button', { name: /Approvals/ })).not.toBeInTheDocument()
  })

  it('lists the oldest five, review-first, with a link to all', async () => {
    const { user } = renderPopover()
    await user.click(await screen.findByRole('button', { name: /Approvals, 6 waiting/ }))
    const items = await screen.findAllByRole('listitem')
    expect(items).toHaveLength(5)
    expect(items[0]).toHaveTextContent('Mark deal D-77 as lost')
    expect(items[0]).toHaveTextContent('Overdue')
    expect(items[1]).toHaveTextContent('Refund order #1001')
    expect(items[1]).toHaveTextContent('$42.00 · 91% confident · Refunds above $200 need approval')
    const payment = items.find((item) => item.textContent.includes('Pay Northwind Ltd'))
    if (!payment) throw new Error('no payment row')
    expect(within(payment).getByRole('link', { name: 'Review' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/acme\/insights\/approvals\/[0-9a-f-]{36}$/),
    )
    expect(screen.getByRole('link', { name: 'See all approvals' })).toHaveAttribute(
      'href',
      '/acme/insights/approvals',
    )
  })

  it('offers Approve only for items inside the quick-approve limit', async () => {
    const { user } = renderPopover()
    await user.click(await screen.findByRole('button', { name: /Approvals, 6 waiting/ }))
    const items = await screen.findAllByRole('listitem')
    const withApprove = items.filter((item) =>
      within(item).queryByRole('button', { name: 'Approve' }),
    )
    expect(withApprove.map((item) => item.textContent)).toEqual([
      expect.stringContaining('Refund order #1001'),
      expect.stringContaining('Refund order #1002'),
    ])
    expect(screen.getByText('Pay Northwind Ltd').closest('li')).not.toHaveTextContent(/Approve$/)
  })

  it('approves with a deferred commit: the item leaves, and Undo brings it back unsent', async () => {
    const sent = vi.fn()
    server.use(
      http.post(mockPath('/orgs/:orgId/approvals/:approvalId/approve'), () => {
        sent()
        return new Response(null, { status: 500 })
      }),
    )
    const { user } = renderPopover()
    await user.click(await screen.findByRole('button', { name: /Approvals, 6 waiting/ }))
    const row = (await screen.findByText('Refund order #1001')).closest('li')
    if (!row) throw new Error('no row')
    await user.click(within(row).getByRole('button', { name: 'Approve' }))

    expect(lastUndo().message).toBe('Approving Refund order #1001')
    await waitFor(() => {
      expect(screen.queryByText('Refund order #1001')).not.toBeInTheDocument()
    })
    lastUndo().options.onUndo()
    expect(await screen.findByText('Refund order #1001')).toBeVisible()
    expect(sent).not.toHaveBeenCalled()
  })

  it('sends the decision, as made from the popover, when the Undo toast closes', async () => {
    let body: unknown
    server.events.on('request:start', async ({ request }) => {
      if (request.method === 'POST') body = await request.clone().json()
    })
    const { user } = renderPopover()
    await user.click(await screen.findByRole('button', { name: /Approvals, 6 waiting/ }))
    const row = (await screen.findByText('Refund order #1001')).closest('li')
    if (!row) throw new Error('no row')
    await user.click(within(row).getByRole('button', { name: 'Approve' }))

    lastUndo().options.onCommit()
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Approved Refund order #1001')
    })
    expect(body).toEqual({ via: 'popover' })
  })

  it('puts the item back and says why when the decision fails', async () => {
    server.use(
      http.post(mockPath('/orgs/:orgId/approvals/:approvalId/approve'), () =>
        Response.json(
          {
            error: {
              code: 'APPROVAL_ALREADY_DECIDED',
              message: 'Omar already approved this',
              requestId: 'req-1',
              details: [],
            },
          },
          { status: 409 },
        ),
      ),
    )
    const { user } = renderPopover()
    await user.click(await screen.findByRole('button', { name: /Approvals, 6 waiting/ }))
    const row = (await screen.findByText('Refund order #1001')).closest('li')
    if (!row) throw new Error('no row')
    await user.click(within(row).getByRole('button', { name: 'Approve' }))
    lastUndo().options.onCommit()
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
    })
    expect(await screen.findByText('Refund order #1001')).toBeVisible()
  })
})
