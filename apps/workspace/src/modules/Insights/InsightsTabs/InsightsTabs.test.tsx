// SPDX-License-Identifier: AGPL-3.0-only
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { renderWithProviders } from '@surefy/web-core/testing'

import InsightsTabs from './InsightsTabs'

vi.mock('next/navigation', () => ({ useParams: () => ({ orgSlug: 'acme' }) }))

function renderTabs(role: 'owner' | 'admin' | 'builder' | 'user') {
  return renderWithProviders(<InsightsTabs active="approvals" />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs(role)),
  })
}

describe('InsightsTabs', () => {
  it('links the released tabs and marks the open one', async () => {
    renderTabs('admin')
    const nav = await screen.findByRole('navigation', { name: 'Insights sections' })
    expect(nav).toBeVisible()
    expect(screen.getByRole('link', { name: 'Approvals' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/acme/insights')
    expect(screen.getByRole('link', { name: 'Approvals' })).toHaveAttribute(
      'href',
      '/acme/insights/approvals',
    )
  })

  it('leaves Runs unlinked until it is released', async () => {
    renderTabs('owner')
    await screen.findByRole('navigation', { name: 'Insights sections' })
    expect(screen.queryByRole('link', { name: 'Runs' })).not.toBeInTheDocument()
  })

  it('gives Builders the overview of their agents', async () => {
    renderTabs('builder')
    await screen.findByRole('navigation', { name: 'Insights sections' })
    expect(screen.getByRole('link', { name: 'Overview' })).toBeVisible()
  })

  it('shows no bar to an approver who may not read the usage numbers', () => {
    renderTabs('user')
    expect(screen.queryByRole('navigation', { name: 'Insights sections' })).not.toBeInTheDocument()
  })
})
