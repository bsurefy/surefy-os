// SPDX-License-Identifier: AGPL-3.0-only
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { renderWithProviders } from '@surefy/web-core/testing'

import NoAccessState from './NoAccessState'

vi.mock('next/navigation', () => ({ useParams: () => ({ orgSlug: 'acme' }) }))

describe('NoAccessState', () => {
  it('names the page, the role and the way out', () => {
    renderWithProviders(<NoAccessState area="guard" />, {
      orgId: ORG_ID,
      messages: appMessages,
      queryClient: seededShellClient(accessAs('builder')),
    })
    expect(
      screen.getByRole('heading', { level: 1, name: "You don't have access to Guard" }),
    ).toBeVisible()
    expect(screen.getByText('Your role is Builder in Acme Logistics.')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Go to Chat' })).toHaveAttribute('href', '/acme/chat')
  })
})
