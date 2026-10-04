// SPDX-License-Identifier: AGPL-3.0-only
import { definePermissions } from '../core/permissions.js'

export const USAGE_PERMISSIONS = definePermissions({
  INSIGHTS_READ: { key: 'insights:read', module: 'insights', minimumRole: 'admin' },
})
