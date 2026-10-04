// SPDX-License-Identifier: AGPL-3.0-only
import type { SchemaGuardLists } from './schemaGuards.js'

/**
 * The lists the guard queries take (conventions-and-security.md, "FORCE RLS and the CI check").
 * Module tasks append their tables here in the same change that creates them.
 */
export const SCHEMA_GUARD_LISTS: SchemaGuardLists = {
  globalTables: [
    'users',
    'sessions',
    'accounts',
    'verifications',
    'two_factors',
    'install_settings',
    'install_admins',
  ],
  appendOnlyTables: [],
  joinTables: ['team_members', 'invitation_teams', 'member_preferences'],
}
