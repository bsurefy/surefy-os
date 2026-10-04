// SPDX-License-Identifier: AGPL-3.0-only
import { definePermissions } from '../core/permissions.js'

export const AUDIT_PERMISSIONS = definePermissions({
  AUDIT_READ: { key: 'audit:read', module: 'guard', minimumRole: 'admin' },
})
