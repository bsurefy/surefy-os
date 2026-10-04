// SPDX-License-Identifier: AGPL-3.0-only
import { definePermissions } from '../core/permissions.js'

export const ORGANIZATIONS_PERMISSIONS = definePermissions({
  SETTINGS_MANAGE: { key: 'settings:manage', module: null, minimumRole: 'admin' },
  BILLING_MANAGE: { key: 'billing:manage', module: null, minimumRole: 'owner' },
})
