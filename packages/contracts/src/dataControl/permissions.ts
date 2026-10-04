// SPDX-License-Identifier: AGPL-3.0-only
import { definePermissions } from '../core/permissions.js'

export const DATA_CONTROL_PERMISSIONS = definePermissions({
  /** Data requests and retention overview (Settings › Data & privacy). */
  DATA_CONTROL_READ: { key: 'data-control:read', module: null, minimumRole: 'admin' },
  /** Export all organization data; Owners only. */
  DATA_CONTROL_EXPORT: { key: 'data-control:export', module: null, minimumRole: 'owner' },
  /** Schedule or cancel the organization's deletion; Owners only. */
  DATA_CONTROL_DELETE: { key: 'data-control:delete', module: null, minimumRole: 'owner' },
  /** Own background exports; the producing module's permission is checked as well. */
  EXPORTS_USE: { key: 'exports:use', module: null, minimumRole: 'user' },
})
