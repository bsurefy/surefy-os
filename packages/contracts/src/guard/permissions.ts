// SPDX-License-Identifier: AGPL-3.0-only
import { definePermissions } from '../core/permissions.js'

export const GUARD_PERMISSIONS = definePermissions({
  /** Overview, defaults and guardrails; Builders see the rules that apply to their agents and flows. */
  GUARD_READ: { key: 'guard:read', module: 'guard', minimumRole: 'builder' },
  /** Change defaults, guardrails and data filters (not locked rules). */
  GUARD_MANAGE: { key: 'guard:manage', module: 'guard', minimumRole: 'admin' },
  /** Lock, unlock and change locked guardrails. */
  GUARD_LOCK: { key: 'guard:lock', module: 'guard', minimumRole: 'owner' },
})
