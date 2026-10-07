// SPDX-License-Identifier: AGPL-3.0-only
import type { Feature } from '../features.js'
import type { ModuleKey } from './modules.js'
import type { OrgRole } from './roles.js'

/** `<resource>:<action>`, lowercase kebab-case, for example `members:manage-admins`. */
export type PermissionKey = `${string}:${string}`

/**
 * One permission. `module` (null = always on) and `feature` decide whether effective access keeps it;
 * `minimumRole` builds the default role mapping. Custom roles (Enterprise) map permissions directly.
 */
export interface PermissionDefinition {
  readonly key: PermissionKey
  readonly module: ModuleKey | null
  readonly minimumRole: OrgRole
  readonly feature?: Feature
}

/** Declares a domain's permissions in its own `<domain>/permissions.ts`. */
export function definePermissions<const T extends Record<string, PermissionDefinition>>(
  definitions: T,
): T {
  return definitions
}
