// SPDX-License-Identifier: AGPL-3.0-only
import { definePermissions } from '../core/permissions.js'

export const ACCESS_PERMISSIONS = definePermissions({
  /** Own effective access (`/access/me`); every role, whatever modules are on. */
  ACCESS_READ_SELF: { key: 'access:read-self', module: null, minimumRole: 'user' },
  /** Effective access of other members and teams, and the restriction policies. */
  ACCESS_READ: { key: 'access:read', module: null, minimumRole: 'admin' },
})
