// SPDX-License-Identifier: AGPL-3.0-only
import { definePermissions } from '../core/permissions.js'

export const CHAT_PERMISSIONS = definePermissions({
  CHAT_USE: { key: 'chat:use', module: 'chat', minimumRole: 'user' },
})
