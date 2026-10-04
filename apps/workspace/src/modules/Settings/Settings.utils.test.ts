// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { ROLE_PERMISSIONS } from '@surefy/contracts'
import type { OrgRole } from '@surefy/contracts'
import { effectiveAccessFactory, installCapabilitiesFactory } from '@surefy/web-core/testing'

import { SETTINGS_PERMISSIONS, SETTINGS_SECTIONS } from './Settings.constants'
import { getVisibleSettingsSections, isSettingsSectionVisible } from './Settings.utils'

import type { SettingsContext, SettingsSectionEntry } from './Settings.types'

function contextFor(role: OrgRole, overrides: Partial<SettingsContext> = {}): SettingsContext {
  return {
    access: effectiveAccessFactory({ role, permissions: [...ROLE_PERMISSIONS[role]] }),
    install: installCapabilitiesFactory(),
    isInstallAdmin: false,
    ...overrides,
  }
}

/** The configured sections as if every one were released. */
const RELEASED = SETTINGS_SECTIONS.map((entry) => ({ ...entry, released: true }))
const visibleIds = (context: SettingsContext) =>
  getVisibleSettingsSections(RELEASED, context).map((entry) => entry.id)

describe('settings section visibility', () => {
  it('hides every section until it is released', () => {
    expect(getVisibleSettingsSections(SETTINGS_SECTIONS, contextFor('owner'))).toEqual([])
  })

  it('shows each role the sections of navigation.md §6', () => {
    expect(visibleIds(contextFor('user'))).toEqual([])
    expect(visibleIds(contextFor('builder'))).toEqual(['vault'])
    expect(visibleIds(contextFor('admin'))).toEqual([
      'general',
      'members',
      'teams',
      'access',
      'vault',
      'dataPrivacy',
      'security',
    ])
  })

  it('shows Install to install administrators only, whatever their role', () => {
    expect(visibleIds(contextFor('owner'))).not.toContain('install')
    expect(visibleIds(contextFor('user', { isInstallAdmin: true }))).toEqual(['install'])
  })

  it('hides a section whose install capability is missing', () => {
    const entry: SettingsSectionEntry = {
      id: 'install',
      section: 'install',
      released: true,
      installCapability: 'licenseManagement',
    }
    const withCapability = contextFor('owner', {
      install: installCapabilitiesFactory({ licenseManagement: true }),
    })
    const without = contextFor('owner', {
      install: installCapabilitiesFactory({ licenseManagement: false }),
    })
    expect(isSettingsSectionVisible(entry, withCapability)).toBe(true)
    expect(isSettingsSectionVisible(entry, without)).toBe(false)
  })

  it('opens the Settings sidebar entry to anyone who can open a section by permission', () => {
    const builder = contextFor('builder')
    expect(SETTINGS_PERMISSIONS.some((p) => builder.access.permissions.includes(p))).toBe(true)
    expect(new Set(SETTINGS_PERMISSIONS).size).toBe(SETTINGS_PERMISSIONS.length)
  })
})
