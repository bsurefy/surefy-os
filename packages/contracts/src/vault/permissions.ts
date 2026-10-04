// SPDX-License-Identifier: AGPL-3.0-only
import { definePermissions } from '../core/permissions.js'

export const VAULT_PERMISSIONS = definePermissions({
  VAULT_READ: { key: 'vault:read', module: null, minimumRole: 'builder' },
  VAULT_MANAGE: { key: 'vault:manage', module: null, minimumRole: 'admin' },
})
