// SPDX-License-Identifier: AGPL-3.0-only
import { definePermissions } from '../core/permissions.js'

export const KNOWLEDGE_PERMISSIONS = definePermissions({
  KNOWLEDGE_READ: { key: 'knowledge:read', module: 'knowledge', minimumRole: 'user' },
  KNOWLEDGE_UPLOAD: { key: 'knowledge:upload', module: 'knowledge', minimumRole: 'builder' },
})
