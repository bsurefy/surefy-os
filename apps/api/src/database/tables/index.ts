// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The Drizzle schema: every table file (`<domain>.tables.ts`, including `partitioned/`) and
 * `relations.ts` is re-exported here, so the client and drizzle-kit see one schema. Module tasks
 * append one `export *` line per domain file, in migration order (conventions-and-security.md,
 * §16): auth, organizations and members, install, vault and access, chat and knowledge, usage
 * and audit, platform tables.
 */
export * from './auth.tables.js'
export * from './organizations.tables.js'
export * from './teams.tables.js'
export * from './members.tables.js'
export * from './install.tables.js'
export * from './vault.tables.js'
export * from './notifications.tables.js'
export * from './access.tables.js'
export * from './chat.tables.js'
export * from './knowledge.tables.js'
export * from './usage.tables.js'
export * from './partitioned/usage.tables.js'
export * from './audit.tables.js'
export * from './partitioned/audit.tables.js'
export * from './dataControl.tables.js'
export * from './outbox.tables.js'
