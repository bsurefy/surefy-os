// SPDX-License-Identifier: AGPL-3.0-only
import { renderHook, screen, waitFor } from '@testing-library/react'
import { http } from 'msw'
import { describe, expect, it } from 'vitest'

import { FEATURES, PERMISSIONS, ROLE_PERMISSIONS } from '@surefy/contracts'
import type { EffectiveAccessDto } from '@surefy/contracts'

import { accessKeys } from '../api/access/access.queries'
import { meKeys } from '../api/me/me.queries'
import {
  createTestQueryClient,
  effectiveAccessFactory,
  fixtureUuid,
  meFactory,
  mockError,
  mockPath,
  renderHookWithProviders,
  renderWithProviders,
  setupTestServer,
} from '../testing'
import { Can } from './Can'
import { FeatureGate } from './FeatureGate'
import { OrgScopeProvider, useCurrentOrgId } from './OrgScopeProvider'
import { useCan, useHasModule } from './useCan'
import { useHasFeature, useIsFeatureReadOnly } from './useHasFeature'
import { usePartnerCan } from './usePartnerCan'
import { usePlatformCan } from './usePlatformCan'

import type { ReactNode } from 'react'

const server = setupTestServer()
const ORG_ID = fixtureUuid(2, 1)

function clientWith(access?: EffectiveAccessDto) {
  const queryClient = createTestQueryClient()
  if (access) queryClient.setQueryData(accessKeys.me(ORG_ID), access)
  return queryClient
}

const inOrg = ({ children }: Readonly<{ children: ReactNode }>) => (
  <OrgScopeProvider orgId={ORG_ID}>{children}</OrgScopeProvider>
)

describe('OrgScopeProvider', () => {
  it('gives the gating hooks the current organization', () => {
    const { result } = renderHook(() => useCurrentOrgId(), { wrapper: inOrg })
    expect(result.current).toBe(ORG_ID)
  })

  it('fails loudly when a gate is used outside an organization', () => {
    expect(() => renderHook(() => useCurrentOrgId())).toThrow(/OrgScopeProvider/)
  })
})

describe('useCan and useHasModule', () => {
  it('follow effective access, never the role name', () => {
    // a Builder whose organization turned Train off
    const access = effectiveAccessFactory({
      role: 'builder',
      permissions: [...ROLE_PERMISSIONS.builder],
      modules: ['chat', 'agents'],
    })
    const { result } = renderHookWithProviders(
      () => ({
        canUseChat: useCan(PERMISSIONS.CHAT_USE),
        canManageBilling: useCan(PERMISSIONS.BILLING_MANAGE),
        hasAgents: useHasModule('agents'),
        hasTrain: useHasModule('train'),
      }),
      { queryClient: clientWith(access), orgId: ORG_ID },
    )

    expect(result.current).toEqual({
      canUseChat: true,
      canManageBilling: false,
      hasAgents: true,
      hasTrain: false,
    })
  })
})

describe('Can', () => {
  it('shows the control only to people who hold the permission', () => {
    const owner = effectiveAccessFactory({
      role: 'owner',
      permissions: [...ROLE_PERMISSIONS.owner],
    })
    const ui = (
      <Can permission={PERMISSIONS.BILLING_MANAGE} fallback={<span>Only Owners</span>}>
        <button type="button">Add credits</button>
      </Can>
    )

    const { unmount } = renderWithProviders(ui, { queryClient: clientWith(owner), orgId: ORG_ID })
    expect(screen.getByRole('button', { name: 'Add credits' })).toBeInTheDocument()
    unmount()

    renderWithProviders(ui, { queryClient: clientWith(effectiveAccessFactory()), orgId: ORG_ID })
    expect(screen.queryByRole('button', { name: 'Add credits' })).not.toBeInTheDocument()
    expect(screen.getByText('Only Owners')).toBeInTheDocument()
  })
})

describe('FeatureGate', () => {
  function renderGate(queryClient = clientWith()) {
    return renderWithProviders(
      <FeatureGate
        feature={FEATURES.SSO}
        fallback={<p>Upgrade card</p>}
        loading={<p>Loading access</p>}
      >
        <p>SSO settings</p>
      </FeatureGate>,
      { queryClient, orgId: ORG_ID },
    )
  }

  it('shows the screen when the feature is available', () => {
    renderGate(clientWith(effectiveAccessFactory({ features: [FEATURES.SSO] })))
    expect(screen.getByText('SSO settings')).toBeInTheDocument()
  })

  it('keeps the screen during the license grace days; it shows itself read-only', () => {
    const access = effectiveAccessFactory({ readOnlyFeatures: [FEATURES.SSO] })
    renderGate(clientWith(access))
    expect(screen.getByText('SSO settings')).toBeInTheDocument()

    const { result } = renderHookWithProviders(
      () => ({ has: useHasFeature(FEATURES.SSO), readOnly: useIsFeatureReadOnly(FEATURES.SSO) }),
      { queryClient: clientWith(access), orgId: ORG_ID },
    )
    expect(result.current).toEqual({ has: false, readOnly: true })
  })

  it('shows the fallback when the feature is not available', () => {
    renderGate(clientWith(effectiveAccessFactory()))
    expect(screen.getByText('Upgrade card')).toBeInTheDocument()
    expect(screen.queryByText('SSO settings')).not.toBeInTheDocument()
  })

  it('never flashes the fallback while access is loading', () => {
    const queryClient = clientWith()
    // a fetch already in flight that never settles: the gate's query joins it
    const neverSettles = new Promise<never>(() => {
      // never resolves or rejects
    })
    void queryClient.query({ queryKey: accessKeys.me(ORG_ID), queryFn: () => neverSettles })

    renderGate(queryClient)

    expect(screen.getByText('Loading access')).toBeInTheDocument()
    expect(screen.queryByText('Upgrade card')).not.toBeInTheDocument()
  })

  it('does not upsell when effective access failed to load', async () => {
    server.use(
      http.get(mockPath(`/orgs/${ORG_ID}/access/me`), () =>
        mockError(500, 'INTERNAL_ERROR', 'Boom'),
      ),
    )

    const { queryClient } = renderGate()

    await waitFor(() => {
      expect(queryClient.getQueryState(accessKeys.me(ORG_ID))?.status).toBe('error')
    })
    expect(screen.getByText('Loading access')).toBeInTheDocument()
    expect(screen.queryByText('Upgrade card')).not.toBeInTheDocument()
  })
})

describe('usePlatformCan and usePartnerCan', () => {
  const partnerId = fixtureUuid(4, 1)
  const me = meFactory({
    platform: { role: 'support', permissions: ['organizations:read'] },
    partners: [
      {
        partner: { id: partnerId, name: 'Northwind', slug: 'northwind' },
        role: 'partner_admin',
        permissions: ['customers:manage'],
      },
    ],
  })

  it('read platform and partner permissions from the me response', () => {
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(meKeys.current(), me)

    const { result } = renderHookWithProviders(
      () => ({
        platformRead: usePlatformCan('organizations:read'),
        platformBilling: usePlatformCan('billing:refund'),
        partnerManage: usePartnerCan(partnerId, 'customers:manage'),
        otherPartner: usePartnerCan(fixtureUuid(4, 2), 'customers:manage'),
      }),
      { queryClient },
    )

    expect(result.current).toEqual({
      platformRead: true,
      platformBilling: false,
      partnerManage: true,
      otherPartner: false,
    })
  })
})
