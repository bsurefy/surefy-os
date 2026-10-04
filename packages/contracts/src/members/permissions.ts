// SPDX-License-Identifier: AGPL-3.0-only
import { definePermissions } from '../core/permissions.js'

export const MEMBERS_PERMISSIONS = definePermissions({
  /** Own membership and per-organization preferences (Profile); every role. */
  MEMBERS_MANAGE_SELF: { key: 'members:manage-self', module: null, minimumRole: 'user' },
  MEMBERS_READ: { key: 'members:read', module: null, minimumRole: 'admin' },
  MEMBERS_INVITE: { key: 'members:invite', module: null, minimumRole: 'admin' },
  /** Roles below Owner, primary team, deactivation and removal of non-Owners. */
  MEMBERS_MANAGE: { key: 'members:manage', module: null, minimumRole: 'admin' },
  /** Anything that touches an Owner: inviting, promoting, demoting, deactivating or removing one. */
  MEMBERS_MANAGE_ADMINS: { key: 'members:manage-admins', module: null, minimumRole: 'owner' },
})
