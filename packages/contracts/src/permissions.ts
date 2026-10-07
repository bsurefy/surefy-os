// SPDX-License-Identifier: AGPL-3.0-only
import { ACCESS_PERMISSIONS } from './access/permissions.js'
import { AUDIT_PERMISSIONS } from './audit/permissions.js'
import { AUTH_PERMISSIONS } from './auth/permissions.js'
import { CHAT_PERMISSIONS } from './chat/permissions.js'
import { ORG_ROLES, roleAtLeast, type OrgRole } from './core/roles.js'
import { DATA_CONTROL_PERMISSIONS } from './dataControl/permissions.js'
import { INSTALL_PERMISSIONS } from './install/permissions.js'
import { KNOWLEDGE_PERMISSIONS } from './knowledge/permissions.js'
import { MEMBERS_PERMISSIONS } from './members/permissions.js'
import { MODELS_PERMISSIONS } from './models/permissions.js'
import { NOTIFICATIONS_PERMISSIONS } from './notifications/permissions.js'
import { ORGANIZATIONS_PERMISSIONS } from './organizations/permissions.js'
import { SETUP_PERMISSIONS } from './setup/permissions.js'
import { TEAMS_PERMISSIONS } from './teams/permissions.js'
import { USAGE_PERMISSIONS } from './usage/permissions.js'
import { VAULT_PERMISSIONS } from './vault/permissions.js'

import type { ModuleKey } from './core/modules.js'
import type { PermissionDefinition } from './core/permissions.js'

/** Every permission definition, one spread per domain. */
export const PERMISSION_DEFINITIONS = {
  ...AUTH_PERMISSIONS,
  ...SETUP_PERMISSIONS,
  ...INSTALL_PERMISSIONS,
  ...ORGANIZATIONS_PERMISSIONS,
  ...MEMBERS_PERMISSIONS,
  ...TEAMS_PERMISSIONS,
  ...ACCESS_PERMISSIONS,
  ...AUDIT_PERMISSIONS,
  ...DATA_CONTROL_PERMISSIONS,
  ...NOTIFICATIONS_PERMISSIONS,
  ...VAULT_PERMISSIONS,
  ...MODELS_PERMISSIONS,
  ...CHAT_PERMISSIONS,
  ...KNOWLEDGE_PERMISSIONS,
  ...USAGE_PERMISSIONS,
} as const satisfies Record<string, PermissionDefinition>

type Definitions = typeof PERMISSION_DEFINITIONS

/** `PERMISSIONS.CHAT_USE` -> `'chat:use'`. Code checks permissions, never role names. */
export const PERMISSIONS = Object.fromEntries(
  Object.entries(PERMISSION_DEFINITIONS).map(([name, definition]) => [name, definition.key]),
) as { readonly [K in keyof Definitions]: Definitions[K]['key'] }
export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

const definitions: PermissionDefinition[] = Object.values(PERMISSION_DEFINITIONS)

/** The module each permission belongs to (null = always on). */
export const PERMISSION_MODULES = Object.fromEntries(
  definitions.map((definition) => [definition.key, definition.module]),
) as Record<Permission, ModuleKey | null>

/** Default permissions per built-in organization role (custom roles replace this mapping). */
export const ROLE_PERMISSIONS = Object.fromEntries(
  ORG_ROLES.map((role) => [
    role,
    definitions
      .filter((definition) => roleAtLeast(role, definition.minimumRole))
      .map((definition) => definition.key),
  ]),
) as unknown as Record<OrgRole, readonly Permission[]>
