// SPDX-License-Identifier: AGPL-3.0-only
import { definePermissions } from '../core/permissions.js'

export const API_KEYS_PERMISSIONS = definePermissions({
  /** List, create (fresh session required), rename and revoke organization API keys. */
  API_KEYS_MANAGE: { key: 'api-keys:manage', module: null, minimumRole: 'admin' },
})
