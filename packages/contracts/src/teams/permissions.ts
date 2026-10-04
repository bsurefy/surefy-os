// SPDX-License-Identifier: AGPL-3.0-only
import { definePermissions } from '../core/permissions.js'

export const TEAMS_PERMISSIONS = definePermissions({
  TEAMS_READ: { key: 'teams:read', module: null, minimumRole: 'admin' },
  TEAMS_MANAGE: { key: 'teams:manage', module: null, minimumRole: 'admin' },
})
