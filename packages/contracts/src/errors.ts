// SPDX-License-Identifier: AGPL-3.0-only
import { ACCESS_ERROR_CODES } from './access/errors.js'
import { AUDIT_ERROR_CODES } from './audit/errors.js'
import { AUTH_ERROR_CODES } from './auth/errors.js'
import { CHAT_ERROR_CODES } from './chat/errors.js'
import { COMMON_ERROR_CODES } from './core/errors.js'
import { DATA_CONTROL_ERROR_CODES } from './dataControl/errors.js'
import { INSTALL_ERROR_CODES } from './install/errors.js'
import { KNOWLEDGE_ERROR_CODES } from './knowledge/errors.js'
import { MEMBERS_ERROR_CODES } from './members/errors.js'
import { MODELS_ERROR_CODES } from './models/errors.js'
import { NOTIFICATIONS_ERROR_CODES } from './notifications/errors.js'
import { ORGANIZATIONS_ERROR_CODES } from './organizations/errors.js'
import { SETUP_ERROR_CODES } from './setup/errors.js'
import { TEAMS_ERROR_CODES } from './teams/errors.js'
import { USAGE_ERROR_CODES } from './usage/errors.js'
import { VAULT_ERROR_CODES } from './vault/errors.js'

/** Every error code the API can return: common codes plus one spread per domain. */
export const ERROR_CODES = {
  ...COMMON_ERROR_CODES,
  ...AUTH_ERROR_CODES,
  ...SETUP_ERROR_CODES,
  ...INSTALL_ERROR_CODES,
  ...ORGANIZATIONS_ERROR_CODES,
  ...MEMBERS_ERROR_CODES,
  ...TEAMS_ERROR_CODES,
  ...ACCESS_ERROR_CODES,
  ...AUDIT_ERROR_CODES,
  ...DATA_CONTROL_ERROR_CODES,
  ...NOTIFICATIONS_ERROR_CODES,
  ...VAULT_ERROR_CODES,
  ...MODELS_ERROR_CODES,
  ...CHAT_ERROR_CODES,
  ...KNOWLEDGE_ERROR_CODES,
  ...USAGE_ERROR_CODES,
} as const
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

/** Per-source code lists, for the duplicate check and the error-message parity check. */
export const ERROR_CODE_SOURCES = {
  common: COMMON_ERROR_CODES,
  auth: AUTH_ERROR_CODES,
  setup: SETUP_ERROR_CODES,
  install: INSTALL_ERROR_CODES,
  organizations: ORGANIZATIONS_ERROR_CODES,
  members: MEMBERS_ERROR_CODES,
  teams: TEAMS_ERROR_CODES,
  access: ACCESS_ERROR_CODES,
  audit: AUDIT_ERROR_CODES,
  dataControl: DATA_CONTROL_ERROR_CODES,
  notifications: NOTIFICATIONS_ERROR_CODES,
  vault: VAULT_ERROR_CODES,
  models: MODELS_ERROR_CODES,
  chat: CHAT_ERROR_CODES,
  knowledge: KNOWLEDGE_ERROR_CODES,
  usage: USAGE_ERROR_CODES,
} as const
