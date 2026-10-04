// SPDX-License-Identifier: AGPL-3.0-only
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, ORG_SLUG, seededShellClient } from '@/test/shell'
import { FEATURES } from '@surefy/contracts'
import { renderWithProviders } from '@surefy/web-core/testing'

import OrgSwitcher from './OrgSwitcher'
import { multiOrgMe, shellMe } from '../../../../../mock/handlers/shell.fixtures'

vi.mock('next/navigation', () => ({ usePathname: () => '/acme/profile' }))

describe('OrgSwitcher', () => {
  it('shows the one Community organization and offers the upgrade instead of creating', async () => {
    const { user } = renderWithProviders(<OrgSwitcher orgSlug={ORG_SLUG} />, {
      orgId: ORG_ID,
      messages: appMessages,
      queryClient: seededShellClient(accessAs('owner'), shellMe()),
    })
    await user.click(
      screen.getByRole('button', { name: 'Switch organization. Current: Acme Logistics' }),
    )
    expect(screen.getAllByRole('menuitem')).toHaveLength(2)
    await user.click(screen.getByRole('menuitem', { name: /Create organization/ }))
    expect(await screen.findByRole('dialog', { name: 'Create organization' })).toBeVisible()
    expect(screen.getByText(/Multiple organizations are part of SurefyOS Enterprise/)).toBeVisible()
  })

  it('lists every organization with its role and keeps the page when switching', async () => {
    const { user } = renderWithProviders(<OrgSwitcher orgSlug={ORG_SLUG} />, {
      orgId: ORG_ID,
      messages: appMessages,
      queryClient: seededShellClient(
        accessAs('owner', { features: [FEATURES.MULTI_ORGANIZATION] }),
        multiOrgMe(),
      ),
    })
    await user.click(screen.getByRole('button', { name: /Switch organization/ }))
    expect(screen.getByRole('menuitem', { name: /Globex Support.*Builder/ })).toHaveAttribute(
      'href',
      '/globex/profile',
    )
    expect(screen.getByRole('menuitem', { name: /Acme Logistics/ })).toHaveAttribute(
      'aria-current',
      'true',
    )
    expect(screen.getByRole('menuitem', { name: 'Create organization' })).toHaveAttribute(
      'href',
      '/organizations',
    )
  })
})
