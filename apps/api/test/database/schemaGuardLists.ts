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
  appendOnlyTables: ['audit_logs', 'audit_chain_heads', 'usage_events'],
  joinTables: [
    'team_members',
    'invitation_teams',
    'member_preferences',
    'audit_chain_heads',
    'vault_settings',
    'usage_daily',
    'usage_monthly',
    'chat_knowledge_bases',
  ],
}
