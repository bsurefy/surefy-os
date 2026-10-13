// SPDX-License-Identifier: AGPL-3.0-only
import { definePermissions } from '../core/permissions.js'

export const CHAT_PERMISSIONS = definePermissions({
  CHAT_USE: { key: 'chat:use', module: 'chat', minimumRole: 'user' },
  /** Create, edit, share with teams, delete and restore shared prompts (V1). */
  PROMPTS_MANAGE_SHARED: { key: 'prompts:manage-shared', module: 'chat', minimumRole: 'builder' },
})
