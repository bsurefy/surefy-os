// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { FEATURES, PERMISSIONS } from '@surefy/contracts'

import { getFeatureStatus, hasModule, hasPermission } from './accessChecks'
import { effectiveAccessFactory } from '../testing/fixtures/identity'

describe('access checks', () => {
  it('answer from the permissions and modules of effective access', () => {
    const access = effectiveAccessFactory({
      permissions: [PERMISSIONS.CHAT_USE],
      modules: ['chat'],
    })

    expect(hasPermission(access, PERMISSIONS.CHAT_USE)).toBe(true)
    expect(hasPermission(access, PERMISSIONS.BILLING_MANAGE)).toBe(false)
    expect(hasModule(access, 'chat')).toBe(true)
    expect(hasModule(access, 'train')).toBe(false)
  })

  it('tell available, read-only (license grace) and unavailable features apart', () => {
    const access = effectiveAccessFactory({
      features: [FEATURES.SSO],
      readOnlyFeatures: [FEATURES.AUDIT_EXPORT],
    })

    expect(getFeatureStatus(access, FEATURES.SSO)).toBe('available')
    expect(getFeatureStatus(access, FEATURES.AUDIT_EXPORT)).toBe('read-only')
    expect(getFeatureStatus(access, FEATURES.SCIM)).toBe('unavailable')
  })
})
