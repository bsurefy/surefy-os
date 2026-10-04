// SPDX-License-Identifier: AGPL-3.0-only
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { FEATURES, ROLE_PERMISSIONS, type Feature } from '@surefy/contracts'

import { accessKeys } from '../api/access/access.queries'
import { meKeys } from '../api/me/me.queries'
import {
  createTestQueryClient,
  effectiveAccessFactory,
  fixtureUuid,
  meFactory,
  renderWithProviders,
  testMessages,
} from '../testing'
import { UpgradeCard } from './UpgradeCard'
import { getFeatureMessageKey } from './UpgradeCard.controller'
import { UpgradeLinksProvider, type UpgradeLinks } from './UpgradeLinksProvider'

const ORG_ID = fixtureUuid(2, 1)
const LINKS: UpgradeLinks = {
  compareEditionsUrl: 'https://surefyos.test/editions',
  licenseHref: '/acme/settings/license',
  plansHref: '/acme/settings/billing',
}

interface Person {
  isInstallAdmin?: boolean
  canManageBilling?: boolean
}

function renderCard(
  feature: Feature,
  { isInstallAdmin = false, canManageBilling = false }: Person = {},
  links: UpgradeLinks = LINKS,
) {
  const queryClient = createTestQueryClient()
  queryClient.setQueryData(meKeys.current(), meFactory({ isInstallAdmin }))
  queryClient.setQueryData(
    accessKeys.me(ORG_ID),
    effectiveAccessFactory(
      canManageBilling ? { role: 'owner', permissions: [...ROLE_PERMISSIONS.owner] } : {},
    ),
  )
  return renderWithProviders(
    <UpgradeLinksProvider links={links}>
      <UpgradeCard feature={feature} preview={<button type="button">Save</button>} />
    </UpgradeLinksProvider>,
    { queryClient, orgId: ORG_ID },
  )
}

describe('UpgradeCard', () => {
  it('names the feature and the edition that includes it', () => {
    renderCard(FEATURES.SSO)

    expect(
      screen.getByRole('heading', { name: 'Single sign-on is part of SurefyOS Enterprise' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/sign in with your identity provider/)).toBeInTheDocument()
    expect(screen.getByText('Preview of Single sign-on')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('names Cloud for Cloud-only features', () => {
    renderCard(FEATURES.DATA_REGIONS)

    expect(
      screen.getByRole('heading', { name: 'Data regions are part of SurefyOS Cloud' }),
    ).toBeInTheDocument()
  })

  it('offers install administrators the license key and the edition comparison', () => {
    renderCard(FEATURES.SSO, { isInstallAdmin: true })

    expect(screen.getByRole('link', { name: 'Enter license key' })).toHaveAttribute(
      'href',
      LINKS.licenseHref,
    )
    const compare = screen.getByRole('link', { name: 'Compare editions' })
    expect(compare).toHaveAttribute('href', LINKS.compareEditionsUrl)
    expect(compare).toHaveAttribute('target', '_blank')
    expect(screen.queryByText('Ask an owner to upgrade')).not.toBeInTheDocument()
  })

  it('offers people who manage billing the plans', () => {
    renderCard(FEATURES.SSO, { canManageBilling: true })

    expect(screen.getByRole('link', { name: 'See plans' })).toHaveAttribute('href', LINKS.plansHref)
    expect(screen.queryByRole('link', { name: 'Enter license key' })).not.toBeInTheDocument()
  })

  it('tells everyone else to ask an owner', () => {
    renderCard(FEATURES.SSO)

    expect(screen.getByText('Ask an owner to upgrade')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'See plans' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Enter license key' })).not.toBeInTheDocument()
  })

  it('shows no action the install has no link for', () => {
    renderCard(
      FEATURES.SSO,
      { canManageBilling: true },
      { compareEditionsUrl: LINKS.compareEditionsUrl },
    )

    expect(screen.queryByRole('link', { name: 'See plans' })).not.toBeInTheDocument()
    expect(screen.getByText('Ask an owner to upgrade')).toBeInTheDocument()
  })

  it.each(Object.values(FEATURES))('has copy for %s', (feature) => {
    const copy = testMessages.editions.features[getFeatureMessageKey(feature)]
    expect(copy.title).toContain('{edition}')
    expect(copy.name).toMatch(/\S/)
    expect(copy.description).toMatch(/\S/)
  })
})

describe('getFeatureMessageKey', () => {
  it('turns kebab-case feature keys into camelCase message keys', () => {
    expect(getFeatureMessageKey(FEATURES.CUSTOM_ROLES)).toBe('customRoles')
    expect(getFeatureMessageKey(FEATURES.SSO)).toBe('sso')
  })
})
