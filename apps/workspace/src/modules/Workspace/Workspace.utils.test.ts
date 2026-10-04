// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { TEST_NAV } from '@/test/navFixtures'
import { FEATURES, PERMISSIONS, ROLE_PERMISSIONS } from '@surefy/contracts'
import type { OrgRole } from '@surefy/contracts'
import { effectiveAccessFactory, installCapabilitiesFactory } from '@surefy/web-core/testing'

import {
  getActiveNavEntry,
  getInitials,
  getNavVisibility,
  getSwitchOrgHref,
  getVisibleNav,
  isCommandAvailable,
} from './Workspace.utils'

import type { NavContext, NavEntry, NavItemKey, WorkspaceCommand } from './Workspace.types'

function contextFor(role: OrgRole, overrides: Partial<NavContext> = {}): NavContext {
  return {
    access: effectiveAccessFactory({ role, permissions: [...ROLE_PERMISSIONS[role]] }),
    install: installCapabilitiesFactory(),
    isInstallAdmin: false,
    ...overrides,
  }
}

const entry = (key: NavItemKey): NavEntry => {
  const found = TEST_NAV.find((item) => item.key === key)
  if (!found) throw new Error(`No test entry ${key}`)
  return found
}
const visibleKeys = (context: NavContext) =>
  getVisibleNav(TEST_NAV, context).map((item) => item.entry.key)

describe('navigation visibility', () => {
  it('shows each role exactly the items its effective access allows', () => {
    expect(visibleKeys(contextFor('user'))).toEqual(['chat'])
    expect(visibleKeys(contextFor('builder'))).toEqual(['chat', 'agents'])
    expect(visibleKeys(contextFor('admin'))).toEqual(['chat', 'agents', 'guard', 'settings'])
    expect(visibleKeys(contextFor('owner'))).toEqual(['chat', 'agents', 'guard', 'settings'])
  })

  it('hides unreleased entries, even for owners', () => {
    expect(getNavVisibility(entry('flows'), contextFor('owner'))).toBe('hidden')
  })

  it('hides a module switched off for the plan, organization or team', () => {
    const context = contextFor('owner')
    context.access = { ...context.access, modules: ['chat'] }
    expect(getNavVisibility(entry('agents'), context)).toBe('hidden')
  })

  it('locks a feature missing from the edition, or hides it when asked', () => {
    const context = contextFor('owner')
    expect(getNavVisibility(entry('guard'), context)).toBe('locked')
    expect(getNavVisibility({ ...entry('guard'), hideWhenUnavailable: true }, context)).toBe(
      'hidden',
    )
    context.access = { ...context.access, features: [FEATURES.AUDIT_EXPORT] }
    expect(getNavVisibility(entry('guard'), context)).toBe('visible')
  })

  it('keeps a read-only feature visible without the lock during the grace days', () => {
    const context = contextFor('owner')
    context.access = { ...context.access, readOnlyFeatures: [FEATURES.AUDIT_EXPORT] }
    expect(getNavVisibility(entry('guard'), context)).toBe('visible')
  })

  it('needs the install capability and install administration when declared', () => {
    const license: NavEntry = {
      ...entry('settings'),
      installCapability: 'licenseManagement',
      installAdminOnly: true,
    }
    expect(getNavVisibility(license, contextFor('owner'))).toBe('hidden')
    expect(getNavVisibility(license, contextFor('owner', { isInstallAdmin: true }))).toBe('visible')
    const cloud = installCapabilitiesFactory({
      licenseManagement: false,
      planBilling: true,
      hosting: 'cloud',
      compareEditionsUrl: null,
    })
    expect(
      getNavVisibility(license, contextFor('owner', { isInstallAdmin: true, install: cloud })),
    ).toBe('hidden')
  })
})

describe('active entry and organization switch', () => {
  const items = getVisibleNav(TEST_NAV, contextFor('owner'))

  it('marks the entry whose pages contain the path, details included', () => {
    expect(getActiveNavEntry(items, '/acme/agents/a1/tools', 'acme')?.entry.key).toBe('agents')
    expect(getActiveNavEntry(items, '/acme/notifications', 'acme')).toBeUndefined()
  })

  it('opens the same module or personal page in the other organization, else its home', () => {
    expect(getSwitchOrgHref('/acme/agents/a1', 'globex', TEST_NAV)).toBe('/globex/agents')
    expect(getSwitchOrgHref('/acme/profile', 'globex', TEST_NAV)).toBe('/globex/profile')
    expect(getSwitchOrgHref('/acme/notifications', 'globex', TEST_NAV)).toBe(
      '/globex/notifications',
    )
    expect(getSwitchOrgHref('/acme/flows/f1', 'globex', TEST_NAV)).toBe('/globex/chat')
    expect(getSwitchOrgHref('/acme/unknown', 'globex', TEST_NAV)).toBe('/globex/chat')
  })
})

describe('module commands', () => {
  const command: WorkspaceCommand = {
    id: 'invite',
    group: 'actions',
    labelKey: 'settings.commands.invite',
    href: (orgSlug) => `/${orgSlug}/settings/members?invite=1`,
    navKey: 'settings',
    anyPermission: [PERMISSIONS.MEMBERS_READ],
  }

  it('follows its sidebar entry and its own permissions', () => {
    const owner = contextFor('owner')
    expect(isCommandAvailable(command, new Set<NavItemKey>(['settings']), owner)).toBe(true)
    expect(isCommandAvailable(command, new Set<NavItemKey>(['chat']), owner)).toBe(false)
    expect(isCommandAvailable(command, new Set<NavItemKey>(['settings']), contextFor('user'))).toBe(
      false,
    )
  })
})

describe('getInitials', () => {
  it('takes the first and last initials', () => {
    expect(getInitials('Maya Okafor')).toBe('MO')
    expect(getInitials('  ada  ')).toBe('A')
    expect(getInitials('Jean Paul Sartre')).toBe('JS')
    expect(getInitials('')).toBe('')
  })
})
