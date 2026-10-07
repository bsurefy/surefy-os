// SPDX-License-Identifier: AGPL-3.0-only
import { definePermissions } from '../core/permissions.js'

export const CONNECTIONS_PERMISSIONS = definePermissions({
  /** Pickers ("Slack accounts I may use"), adding a personal connection and disconnecting one's own. */
  CONNECTIONS_USE: { key: 'connections:use', module: null, minimumRole: 'builder' },
  /** The full list, team and organization connections, reconnecting and disconnecting anyone's. */
  CONNECTIONS_MANAGE: { key: 'connections:manage', module: null, minimumRole: 'admin' },
})
