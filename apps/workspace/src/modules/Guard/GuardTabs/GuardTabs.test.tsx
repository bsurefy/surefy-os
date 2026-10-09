// SPDX-License-Identifier: AGPL-3.0-only
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { renderWithProviders } from '@surefy/web-core/testing'

import GuardTabs from './GuardTabs'

vi.mock('next/navigation', () => ({ useParams: () => ({ orgSlug: 'acme' }) }))

function renderTabs(role: 'owner' | 'admin' | 'builder') {
  return renderWithProviders(<GuardTabs active="defaults" />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs(role)),
  })
}

describe('GuardTabs', () => {
  it('links every tab to its page and marks the open one', async () => {
    renderTabs('admin')
    const nav = await screen.findByRole('navigation', { name: 'Guard sections' })
    expect(nav).toBeVisible()
    expect(screen.getByRole('link', { name: 'Defaults' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'href',
      '/acme/guard/overview',
    )
    expect(screen.getByRole('link', { name: 'Audit log' })).toHaveAttribute(
      'href',
      '/acme/guard/audit-log',
    )
  })

  it('leaves the audit log to Admins and Owners', async () => {
    renderTabs('builder')
    expect(await screen.findByRole('link', { name: 'Guardrails' })).toBeVisible()
    expect(screen.queryByRole('link', { name: 'Audit log' })).not.toBeInTheDocument()
  })
})
