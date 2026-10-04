// SPDX-License-Identifier: AGPL-3.0-only
import { definePermissions } from '../core/permissions.js'

export const MEMBERS_PERMISSIONS = definePermissions({
  MEMBERS_READ: { key: 'members:read', module: null, minimumRole: 'admin' },
  MEMBERS_INVITE: { key: 'members:invite', module: null, minimumRole: 'admin' },
  MEMBERS_MANAGE_ADMINS: { key: 'members:manage-admins', module: null, minimumRole: 'owner' },
})
