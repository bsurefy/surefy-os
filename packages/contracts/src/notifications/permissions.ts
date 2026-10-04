// SPDX-License-Identifier: AGPL-3.0-only
import { definePermissions } from '../core/permissions.js'

export const NOTIFICATIONS_PERMISSIONS = definePermissions({
  /** Own notifications only; the service filters by the signed-in member. */
  NOTIFICATIONS_READ: { key: 'notifications:read', module: null, minimumRole: 'user' },
})
